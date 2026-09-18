import path from "node:path";

export function titleFromFilename(filePath: string): string {
  const base = path.basename(filePath, path.extname(filePath));
  return base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}
