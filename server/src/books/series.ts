import path from "node:path";

export interface SeriesAssignment {
  seriesTitle: string;
  volumeNumber: number;
  volumeLabel: string;
  /** Filename with the volume marker (and series name, if a prefix) stripped out. */
  suggestedTitle?: string;
}

function cleanTitle(raw: string): string {
  return raw
    .replace(/[_.]+/g, " ")
    .replace(/\(\s*\)/g, "") // stray empty parens left after stripping a "(Series Book N)" marker
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-–—]+\s*/, "")
    .replace(/\s*[-–—]+$/, "")
    .trim();
}

// Ordered most-specific-first so an explicit "Vol"/"Book"/"Part"/"Episode"
// marker is preferred over a bare number that could just be part of a title
// (e.g. "Fahrenheit 451").
const VOLUME_NUMBER_PATTERNS = [
  /\b(?:vol(?:ume)?|book|part|episode|ep|no)\.?\s*#?\s*(\d+(?:\.\d+)?)\b/i,
  /#\s*(\d+(?:\.\d+)?)\b/,
  /(?:^|[\s._-])(\d{1,4}(?:\.\d+)?)(?:[\s._-]|$)/,
];

function extractVolumeNumber(
  nameWithoutExt: string
): { num: number; label: string; remainder: string } | undefined {
  for (const pattern of VOLUME_NUMBER_PATTERNS) {
    const match = pattern.exec(nameWithoutExt);
    if (match) {
      const remainder = nameWithoutExt.slice(0, match.index) + nameWithoutExt.slice(match.index + match[0].length);
      return { num: parseFloat(match[1]), label: match[0].trim(), remainder };
    }
  }
  return undefined;
}

// Only used for flat (non-folder-grouped) files: the series name must appear
// as a prefix before the volume marker, e.g. "Discworld 01 - The Colour of
// Magic" or "Mistborn Vol. 2". A trailing bare number is the lowest-priority,
// highest-false-positive pattern, which is why grouping additionally requires
// 2+ files sharing the exact same extracted prefix (see detectSeriesGroups).
const SERIES_PREFIX_PATTERNS = [
  /^(.+?)[\s._-]+(?:vol(?:ume)?|book|part|episode|ep)\.?\s*#?\s*\d+(?:\.\d+)?\b/i,
  /^(.+?)[\s._-]+#\s*\d+(?:\.\d+)?\b/,
  /^(.+?)[\s._-]+\d{1,4}(?:\.\d+)?(?:[\s._-]|$)/,
];

function extractSeriesPrefix(nameWithoutExt: string): string | undefined {
  for (const pattern of SERIES_PREFIX_PATTERNS) {
    const match = pattern.exec(nameWithoutExt);
    if (match) {
      const title = cleanTitle(match[1]);
      if (title.length >= 2) return title;
    }
  }
  return undefined;
}

// Common ebook-manager convention (Calibre and friends), where each volume
// lives alone in its own per-title folder so the folder heuristic above
// never applies: "The Final Empire (Mistborn Book 1).epub", "The Well of
// Ascension (Mistborn, Book 2).epub". The series name and volume number are
// both inside the parenthetical, unlike the prefix patterns above.
const PARENTHETICAL_SERIES_PATTERN =
  /\(([^()]+?)[\s,]+(?:book|vol(?:ume)?|part|episode|ep|#)\.?\s*#?\s*(\d+(?:\.\d+)?)\)/i;

function extractParenthetical(
  nameWithoutExt: string
): { seriesTitle: string; num: number; label: string; remainder: string } | undefined {
  const match = PARENTHETICAL_SERIES_PATTERN.exec(nameWithoutExt);
  if (!match) return undefined;
  const seriesTitle = cleanTitle(match[1]);
  if (seriesTitle.length < 2) return undefined;
  const remainder = nameWithoutExt.slice(0, match.index) + nameWithoutExt.slice(match.index + match[0].length);
  return { seriesTitle, num: parseFloat(match[2]), label: match[0].trim(), remainder };
}

interface VolumeHint {
  num: number;
  label: string;
  remainder: string;
}

function assignVolumes(
  files: string[],
  seriesTitle: string,
  hints?: Map<string, VolumeHint>
): Map<string, SeriesAssignment> {
  const assignments = new Map<string, SeriesAssignment>();
  const unmatched: string[] = [];
  let maxMatched = 0;

  for (const file of files) {
    const base = path.basename(file, path.extname(file));
    const found = hints?.get(file) ?? extractVolumeNumber(base);
    if (found) {
      const remainder = cleanTitle(found.remainder);
      // For a flat "Discworld 01" filename with no real subtitle, the
      // remainder after stripping the number is just "Discworld" again —
      // not a useful per-volume title, so fall back to the raw filename.
      const suggestedTitle =
        remainder && remainder.toLowerCase() !== seriesTitle.toLowerCase() ? remainder : undefined;
      assignments.set(file, { seriesTitle, volumeNumber: found.num, volumeLabel: found.label, suggestedTitle });
      maxMatched = Math.max(maxMatched, found.num);
    } else {
      unmatched.push(file);
    }
  }

  // Files with no detectable number still belong to the group (e.g. a bonus
  // story or omnibus) — park them after the known volumes, ordered stably.
  unmatched.sort();
  unmatched.forEach((file, i) => {
    const base = path.basename(file, path.extname(file));
    assignments.set(file, {
      seriesTitle,
      volumeNumber: maxMatched + 1 + i,
      volumeLabel: cleanTitle(base),
    });
  });

  return assignments;
}

/**
 * Detects multi-volume works the way a TV library groups episodes under a
 * show: a subfolder holding 2+ book files is treated as a series named after
 * that folder, and a numbered filename prefix does the same for flat files
 * (root-level, or a folder with just one book) — but only when 2+ sibling
 * files in the same directory share the same extracted prefix, so a lone
 * "Fahrenheit 451" never becomes a false-positive series of one.
 */
export function detectSeriesGroups(files: string[], libraryDir: string): Map<string, SeriesAssignment> {
  const assignments = new Map<string, SeriesAssignment>();
  const resolvedLibraryDir = path.resolve(libraryDir);

  const byDir = new Map<string, string[]>();
  for (const file of files) {
    const dir = path.dirname(file);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir)!.push(file);
  }

  // Files with no directory-mates worth grouping on file count alone — but a
  // single-book folder's NAME is still worth checking for series info, since
  // ebook managers (Calibre included) commonly name it "Title (Series, Book
  // N)" while leaving that out of the file inside.
  const flatCandidates: { file: string; folderName?: string }[] = [];

  for (const [dir, filesInDir] of byDir) {
    const isLibraryRoot = path.resolve(dir) === resolvedLibraryDir;
    if (!isLibraryRoot && filesInDir.length >= 2) {
      const seriesTitle = cleanTitle(path.basename(dir));
      for (const [file, assignment] of assignVolumes(filesInDir, seriesTitle)) {
        assignments.set(file, assignment);
      }
    } else {
      const folderName = isLibraryRoot ? undefined : path.basename(dir);
      flatCandidates.push(...filesInDir.map((file) => ({ file, folderName })));
    }
  }

  const byPrefix = new Map<string, { seriesTitle: string; files: string[] }>();
  const hints = new Map<string, VolumeHint>();

  for (const { file, folderName } of flatCandidates) {
    const base = path.basename(file, path.extname(file));
    const candidates = folderName ? [base, folderName] : [base];

    // Try the more specific, more reliable pattern first: a "(Series Book N)"
    // marker gives us both the series name and the volume number directly,
    // unlike the prefix patterns which only work when the series name leads
    // the filename (not true for "Author - Title (Series Book N)").
    let paren: ReturnType<typeof extractParenthetical>;
    for (const candidate of candidates) {
      paren = extractParenthetical(candidate);
      if (paren) break;
    }
    let seriesTitle = paren?.seriesTitle;
    if (!seriesTitle) {
      for (const candidate of candidates) {
        seriesTitle = extractSeriesPrefix(candidate);
        if (seriesTitle) break;
      }
    }
    if (!seriesTitle) continue;

    if (paren) hints.set(file, { num: paren.num, label: paren.label, remainder: paren.remainder });

    // The parenthetical marker is explicit enough to group library-wide —
    // ebook managers commonly file each volume in its own per-title folder
    // (e.g. "Author/Title (Series, Book N)/book.epub"), so requiring a
    // shared directory would defeat the point. The plain bare-number prefix
    // heuristic is far more prone to false positives, so it stays scoped to
    // siblings in the same directory.
    const key = paren ? `paren::${seriesTitle.toLowerCase()}` : `${path.dirname(file)}::${seriesTitle.toLowerCase()}`;
    if (!byPrefix.has(key)) byPrefix.set(key, { seriesTitle, files: [] });
    byPrefix.get(key)!.files.push(file);
  }

  for (const { seriesTitle, files: groupFiles } of byPrefix.values()) {
    if (groupFiles.length < 2) continue;
    for (const [file, assignment] of assignVolumes(groupFiles, seriesTitle, hints)) {
      assignments.set(file, assignment);
    }
  }

  return assignments;
}
