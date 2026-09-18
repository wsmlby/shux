import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db.js";
import type { BookFormat } from "../types.js";
import { config, coversDir } from "../config.js";
import { parseEpub } from "./parsers/epub.js";
import { parsePdf, extractPdfCover } from "./parsers/pdf.js";
import { titleFromFilename } from "./parsers/filename.js";
import { fetchOpenLibraryMetadata } from "./metadata/openLibrary.js";
import { detectSeriesGroups, type SeriesAssignment } from "./series.js";

export interface ScanLogger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

const consoleLogger: ScanLogger = {
  info: (obj, msg) => console.log(`[scan] ${msg ?? ""}`, obj),
  warn: (obj, msg) => console.warn(`[scan] ${msg ?? ""}`, obj),
  error: (obj, msg) => console.error(`[scan] ${msg ?? ""}`, obj),
};

const EXTENSION_FORMAT: Record<string, BookFormat> = {
  ".pdf": "PDF",
  ".epub": "EPUB",
  ".txt": "TXT",
};

async function walk(dir: string, logger: ScanLogger): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    logger.warn({ err, dir }, "failed to read subdirectory, skipping it");
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    try {
      // Media libraries are often organized with symlinks; readdir's dirent
      // type reflects the link itself, so resolve it to know what it points at.
      const stat = entry.isSymbolicLink() ? await fs.stat(full) : entry;
      if (stat.isDirectory()) {
        files.push(...(await walk(full, logger)));
      } else if (stat.isFile() && EXTENSION_FORMAT[path.extname(entry.name).toLowerCase()]) {
        files.push(full);
      }
    } catch (err) {
      logger.warn({ err, path: full }, "failed to inspect entry, skipping it");
    }
  }
  return files;
}

export async function saveCover(bookId: string, cover: Buffer) {
  await fs.mkdir(coversDir, { recursive: true });
  await fs.writeFile(path.join(coversDir, `${bookId}.jpg`), cover);
}

interface ParsedMetadata {
  title?: string;
  author?: string;
  description?: string;
  isbn?: string;
  publishedAt?: string;
  cover?: Buffer;
}

async function parseFileMetadata(filePath: string, format: BookFormat, logger: ScanLogger): Promise<ParsedMetadata> {
  if (format === "EPUB") {
    return parseEpub(filePath);
  }
  if (format === "PDF") {
    const meta = await parsePdf(filePath);
    const cover = await extractPdfCover(filePath).catch((err) => {
      logger.warn({ err, filePath }, "failed to extract PDF cover");
      return undefined;
    });
    return { ...meta, cover };
  }
  return {};
}

async function ingestFile(
  filePath: string,
  logger: ScanLogger,
  assignment: SeriesAssignment | undefined,
  resolveSeriesId: (title: string) => Promise<string>
): Promise<void> {
  const format = EXTENSION_FORMAT[path.extname(filePath).toLowerCase()];
  const stat = await fs.stat(filePath);
  const meta = await parseFileMetadata(filePath, format, logger);
  const title = meta.title ?? assignment?.suggestedTitle ?? titleFromFilename(filePath);

  const seriesId = assignment ? await resolveSeriesId(assignment.seriesTitle) : undefined;

  const book = await prisma.book.create({
    data: {
      path: filePath,
      format,
      title,
      author: meta.author,
      description: meta.description,
      isbn: meta.isbn,
      publishedAt: meta.publishedAt,
      fileSize: stat.size,
      hasCover: false,
      seriesId,
      volumeNumber: assignment?.volumeNumber,
      volumeLabel: assignment?.volumeLabel,
    },
  });

  logger.info({ path: filePath, format, title, series: assignment?.seriesTitle }, "ingested book");

  if (meta.cover) {
    await saveCover(book.id, meta.cover);
    await prisma.book.update({ where: { id: book.id }, data: { hasCover: true } });
  }

  // Best-effort enrichment; never block ingestion on network availability.
  enrichFromOpenLibrary(book.id, title, meta.author, !!meta.cover).catch((err) => {
    logger.warn({ err, bookId: book.id, title }, "Open Library enrichment failed");
  });
}

interface ExistingBook {
  id: string;
  path: string;
  title: string;
  author: string | null;
  hasCover: boolean;
  seriesId: string | null;
  volumeNumber: number | null;
  volumeLabel: string | null;
  seriesOverride: boolean;
  series: { title: string } | null;
}

async function refreshBookMetadata(
  book: ExistingBook,
  assignment: SeriesAssignment | undefined,
  logger: ScanLogger
): Promise<void> {
  const format = EXTENSION_FORMAT[path.extname(book.path).toLowerCase()];
  const meta = await parseFileMetadata(book.path, format, logger);

  // Only overwrite fields we found something for — a transient parse hiccup
  // (or a format with no metadata to find) should never blank out good data.
  const updates: Record<string, unknown> = {};
  // Formats with no embedded title (TXT, or a PDF missing /Info) fall back to
  // the filename at ingest time, same as here — but if the book turned out
  // to be part of a series, prefer the marker-stripped title (e.g. "The
  // Final Empire" over "01 The Final Empire") so a reset+rescan reaches the
  // same quality a fresh ingest would.
  if (meta.title) updates.title = meta.title;
  else if (assignment?.suggestedTitle && assignment.suggestedTitle !== book.title) {
    updates.title = assignment.suggestedTitle;
  }
  if (meta.author) updates.author = meta.author;
  if (meta.description) updates.description = meta.description;
  if (meta.isbn) updates.isbn = meta.isbn;
  if (meta.publishedAt) updates.publishedAt = meta.publishedAt;

  if (meta.cover) {
    await saveCover(book.id, meta.cover);
    updates.hasCover = true;
  }

  if (Object.keys(updates).length > 0) {
    await prisma.book.update({ where: { id: book.id }, data: updates });
  }
  logger.info({ path: book.path, refreshed: Object.keys(updates) }, "refreshed book metadata");

  const hasCoverNow = updates.hasCover === true || book.hasCover;
  enrichFromOpenLibrary(
    book.id,
    (updates.title as string) ?? book.title,
    (updates.author as string) ?? book.author ?? undefined,
    hasCoverNow
  ).catch((err) => {
    logger.warn({ err, bookId: book.id }, "Open Library re-enrichment failed");
  });
}

async function enrichFromOpenLibrary(
  bookId: string,
  title: string,
  author: string | undefined,
  hasCover: boolean
) {
  const result = await fetchOpenLibraryMetadata(title, author);
  if (!result) return;

  const updates: Record<string, unknown> = {};
  if (result.description) updates.description = result.description;
  if (result.publishedAt) updates.publishedAt = result.publishedAt;
  if (result.isbn) updates.isbn = result.isbn;

  if (!hasCover && result.coverUrl) {
    try {
      const response = await fetch(result.coverUrl);
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        await saveCover(bookId, buffer);
        updates.hasCover = true;
      }
    } catch {
      // ignore cover download failures
    }
  }

  if (Object.keys(updates).length > 0) {
    await prisma.book.update({ where: { id: bookId }, data: updates }).catch(() => {});
  }
}

function makeSeriesIdResolver() {
  const cache = new Map<string, Promise<string>>();
  return async (title: string): Promise<string> => {
    let pending = cache.get(title);
    if (!pending) {
      pending = prisma.series
        .upsert({ where: { title }, create: { title }, update: {} })
        .then((series) => series.id);
      cache.set(title, pending);
    }
    return pending;
  };
}

async function applySeriesAssignment(
  book: ExistingBook,
  assignment: SeriesAssignment | undefined,
  resolveSeriesId: (title: string) => Promise<string>
): Promise<void> {
  // A manual "ungroup series" set this — respect it until a metadata reset
  // clears it, instead of silently regrouping on the very next scan.
  if (book.seriesOverride) return;

  if (!assignment) {
    if (book.seriesId !== null) {
      await prisma.book.update({
        where: { id: book.id },
        data: { seriesId: null, volumeNumber: null, volumeLabel: null },
      });
    }
    return;
  }

  const seriesId = await resolveSeriesId(assignment.seriesTitle);
  const unchanged =
    book.seriesId === seriesId &&
    book.volumeNumber === assignment.volumeNumber &&
    book.volumeLabel === assignment.volumeLabel;
  if (unchanged) return;

  await prisma.book.update({
    where: { id: book.id },
    data: { seriesId, volumeNumber: assignment.volumeNumber, volumeLabel: assignment.volumeLabel },
  });
}

export interface ScanOptions {
  /** Re-parse metadata/covers for every existing book, not just new files. */
  full?: boolean;
}

export interface ScanResult {
  scanned: number;
  added: number;
  removed: number;
  refreshed: number;
}

export async function scanLibrary(
  logger: ScanLogger = consoleLogger,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const startedAt = Date.now();
  logger.info({ libraryDir: config.libraryDir, full: !!options.full }, "scan starting");

  await fs.mkdir(config.libraryDir, { recursive: true });

  // Fail loudly if the mounted library directory itself can't be read (wrong
  // path, or a container/host UID mismatch on the bind mount) instead of
  // letting walk() swallow it into a silent "0 books found" result.
  try {
    const topLevel = await fs.readdir(config.libraryDir);
    logger.info({ libraryDir: config.libraryDir, entries: topLevel.length }, "library directory is readable");
  } catch (err) {
    logger.error({ err, libraryDir: config.libraryDir }, "library directory is not readable");
    const code = (err as NodeJS.ErrnoException).code ?? "unknown error";
    throw new Error(
      `Cannot read library directory "${config.libraryDir}" (${code}). Check the volume mount and that its permissions allow the container to read it.`
    );
  }

  const files = await walk(config.libraryDir, logger);
  logger.info({ found: files.length }, "file walk complete");

  const existing = await prisma.book.findMany({
    select: {
      id: true,
      path: true,
      title: true,
      author: true,
      hasCover: true,
      seriesId: true,
      volumeNumber: true,
      volumeLabel: true,
      seriesOverride: true,
      series: { select: { title: true } },
    },
  });
  const existingByPath = new Map(existing.map((b) => [b.path, b]));
  const foundPaths = new Set(files);

  const newFiles = files.filter((f) => !existingByPath.has(f));
  const missing = existing.filter((b) => !foundPaths.has(b.path));
  const stillPresent = existing.filter((b) => foundPaths.has(b.path));

  const seriesAssignments = detectSeriesGroups(files, config.libraryDir);
  const seriesCount = new Set([...seriesAssignments.values()].map((a) => a.seriesTitle)).size;
  logger.info({ seriesDetected: seriesCount, volumesGrouped: seriesAssignments.size }, "series detection complete");

  const resolveSeriesId = makeSeriesIdResolver();

  for (const file of newFiles) {
    await ingestFile(file, logger, seriesAssignments.get(file), resolveSeriesId).catch((err) => {
      logger.error({ err, file }, "failed to ingest file");
    });
  }

  let refreshed = 0;
  if (options.full) {
    for (const book of stillPresent) {
      await refreshBookMetadata(book, seriesAssignments.get(book.path), logger).catch((err) => {
        logger.error({ err, path: book.path }, "failed to refresh book metadata");
      });
      refreshed++;
    }
  }

  for (const book of stillPresent) {
    await applySeriesAssignment(book, seriesAssignments.get(book.path), resolveSeriesId).catch((err) => {
      logger.warn({ err, path: book.path }, "failed to apply series assignment");
    });
  }

  if (missing.length > 0) {
    await prisma.book.deleteMany({ where: { id: { in: missing.map((b) => b.id) } } });
  }

  const { count: prunedSeries } = await prisma.series.deleteMany({ where: { books: { none: {} } } });
  if (prunedSeries > 0) logger.info({ prunedSeries }, "removed empty series");

  const result = { scanned: files.length, added: newFiles.length, removed: missing.length, refreshed };
  logger.info({ ...result, durationMs: Date.now() - startedAt }, "scan finished");
  return result;
}

/**
 * Wipes every book's derived metadata (title reverts to the filename,
 * author/description/isbn/publishedAt/cover/series all cleared) while
 * keeping the Book row itself — so its id survives and reading progress
 * isn't lost. Meant as a "start clean" step before a Full Rescan: unlike a
 * normal rescan, which only ever adds data it finds and never removes stale
 * or wrong values from an earlier bug or bad metadata match, this actually
 * clears the slate first.
 */
export async function resetAllMetadata(logger: ScanLogger = consoleLogger): Promise<{ reset: number }> {
  const books = await prisma.book.findMany({ select: { id: true, path: true, hasCover: true } });
  logger.info({ count: books.length }, "resetting all book metadata");

  for (const book of books) {
    if (book.hasCover) {
      await fs.unlink(path.join(coversDir, `${book.id}.jpg`)).catch(() => {});
    }
    await prisma.book.update({
      where: { id: book.id },
      data: {
        title: titleFromFilename(book.path),
        author: null,
        description: null,
        isbn: null,
        publishedAt: null,
        hasCover: false,
        seriesId: null,
        volumeNumber: null,
        volumeLabel: null,
        seriesOverride: false,
      },
    });
  }

  // Every series just lost all of its books above.
  await prisma.series.deleteMany({});

  logger.info({ count: books.length }, "metadata reset complete");
  return { reset: books.length };
}
