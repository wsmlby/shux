import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db.js";
import type { BookFormat } from "../types.js";
import { config, coversDir } from "../config.js";
import { parseEpub } from "./parsers/epub.js";
import { parsePdf } from "./parsers/pdf.js";
import { titleFromFilename } from "./parsers/filename.js";
import { fetchOpenLibraryMetadata } from "./metadata/openLibrary.js";

const EXTENSION_FORMAT: Record<string, BookFormat> = {
  ".pdf": "PDF",
  ".epub": "EPUB",
  ".txt": "TXT",
};

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (EXTENSION_FORMAT[path.extname(entry.name).toLowerCase()]) {
      files.push(full);
    }
  }
  return files;
}

async function saveCover(bookId: string, cover: Buffer) {
  await fs.mkdir(coversDir, { recursive: true });
  await fs.writeFile(path.join(coversDir, `${bookId}.jpg`), cover);
}

async function ingestFile(filePath: string): Promise<void> {
  const format = EXTENSION_FORMAT[path.extname(filePath).toLowerCase()];
  const stat = await fs.stat(filePath);

  let title = titleFromFilename(filePath);
  let author: string | undefined;
  let description: string | undefined;
  let isbn: string | undefined;
  let publishedAt: string | undefined;
  let cover: Buffer | undefined;

  if (format === "EPUB") {
    const meta = parseEpub(filePath);
    title = meta.title ?? title;
    author = meta.author;
    description = meta.description;
    isbn = meta.isbn;
    publishedAt = meta.publishedAt;
    cover = meta.cover;
  } else if (format === "PDF") {
    const meta = await parsePdf(filePath);
    title = meta.title ?? title;
    author = meta.author;
  }

  const book = await prisma.book.create({
    data: {
      path: filePath,
      format,
      title,
      author,
      description,
      isbn,
      publishedAt,
      fileSize: stat.size,
      hasCover: false,
    },
  });

  if (cover) {
    await saveCover(book.id, cover);
    await prisma.book.update({ where: { id: book.id }, data: { hasCover: true } });
  }

  // Best-effort enrichment; never block ingestion on network availability.
  enrichFromOpenLibrary(book.id, title, author, !!cover).catch(() => {});
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

export interface ScanResult {
  scanned: number;
  added: number;
  removed: number;
}

export async function scanLibrary(): Promise<ScanResult> {
  await fs.mkdir(config.libraryDir, { recursive: true });
  const files = await walk(config.libraryDir);

  const existing = await prisma.book.findMany({ select: { id: true, path: true } });
  const existingPaths = new Set(existing.map((b) => b.path));
  const foundPaths = new Set(files);

  const newFiles = files.filter((f) => !existingPaths.has(f));
  const missing = existing.filter((b) => !foundPaths.has(b.path));

  for (const file of newFiles) {
    await ingestFile(file).catch((err) => {
      console.error(`Failed to ingest ${file}:`, err);
    });
  }

  if (missing.length > 0) {
    await prisma.book.deleteMany({ where: { id: { in: missing.map((b) => b.id) } } });
  }

  return { scanned: files.length, added: newFiles.length, removed: missing.length };
}
