import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
// pdf-parse ships no ESM types; the default export is the parse function.
import pdfParse from "pdf-parse";

const execFileAsync = promisify(execFile);

export interface PdfMetadata {
  title?: string;
  author?: string;
}

export async function parsePdf(filePath: string): Promise<PdfMetadata> {
  try {
    const buffer = await fs.readFile(filePath);
    const result = await pdfParse(buffer, { max: 1 });
    const info = result.info as Record<string, string> | undefined;
    return {
      title: info?.Title?.trim() || undefined,
      author: info?.Author?.trim() || undefined,
    };
  } catch {
    return {};
  }
}

// Thrown specifically when pdftoppm isn't on PATH at all, as distinct from
// pdftoppm running but failing on a particular file — callers use this to
// tell a user "rebuild your image" apart from "this PDF is the problem".
export class PopplerNotInstalledError extends Error {
  constructor() {
    super("pdftoppm not found — poppler-utils is not installed in this environment");
    this.name = "PopplerNotInstalledError";
  }
}

let poppierAvailable: boolean | undefined;

// Renders the first page to a JPEG via poppler-utils' pdftoppm, the same
// approach most self-hosted book servers use — avoids pulling in a native
// Canvas binding just to rasterize one page. Throws (rather than swallowing
// the failure) so callers with different needs — a background scan that
// should degrade quietly vs. a user-triggered "regenerate cover" action that
// should explain what went wrong — can each decide how to handle it.
export async function extractPdfCover(filePath: string): Promise<Buffer> {
  if (poppierAvailable === false) throw new PopplerNotInstalledError();

  // pdftoppm appends a page-number suffix whose zero-padding width depends on
  // the PDF's total page count (e.g. "-1.jpg" for a short PDF but "-001.jpg"
  // for a 100+ page one) — guessing the exact name is fragile, so give it an
  // isolated directory and just read back whatever landed there.
  const outDir = path.join(os.tmpdir(), `shux-cover-${randomUUID()}`);
  await fs.mkdir(outDir, { recursive: true });
  const outPrefix = path.join(outDir, "cover");

  try {
    try {
      await execFileAsync("pdftoppm", ["-jpeg", "-f", "1", "-l", "1", "-scale-to-x", "600", "-scale-to-y", "-1", filePath, outPrefix]);
      poppierAvailable = true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        poppierAvailable = false;
        throw new PopplerNotInstalledError();
      }
      throw new Error(`pdftoppm failed to render a cover: ${err instanceof Error ? err.message : String(err)}`);
    }

    const files = await fs.readdir(outDir);
    if (files.length === 0) {
      throw new Error("pdftoppm produced no output file");
    }
    return await fs.readFile(path.join(outDir, files[0]));
  } finally {
    await fs.rm(outDir, { recursive: true, force: true }).catch(() => {});
  }
}
