import fs from "node:fs/promises";
// pdf-parse ships no ESM types; the default export is the parse function.
import pdfParse from "pdf-parse";

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
