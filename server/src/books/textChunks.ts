import fsp from "node:fs/promises";
import iconv from "iconv-lite";

// Text is paginated by JS-string character count, not raw bytes. Byte-range
// chunking (the original approach) only "worked" for UTF-8 because UTF-8 is
// self-synchronizing — a chunk that starts mid-character resyncs within a
// byte or two, corrupting at most one character at the seam. Encodings like
// GBK/Big5/Shift_JIS are NOT self-synchronizing: a chunk starting on what
// was a trail byte gets reinterpreted as a lead byte, and every character
// after it decodes wrong for the rest of the chunk. Decoding the whole file
// once and slicing the resulting *string* sidesteps this entirely — string
// indices are always character-safe (the only residual risk is splitting a
// UTF-16 surrogate pair right at a chunk boundary, the same one-character,
// cosmetic-at-worst seam UTF-8 already had).
export const TEXT_CHUNK_SIZE = 4000;

interface CacheEntry {
  key: string;
  text: string;
}

// Bounded so only a handful of recently-read books' decoded text sit in
// memory at once — plenty for someone actively reading, without holding the
// whole library decoded.
const MAX_CACHE_ENTRIES = 5;
const cache = new Map<string, CacheEntry>();

async function getDecodedText(bookId: string, filePath: string, encoding: string): Promise<string> {
  const stat = await fsp.stat(filePath);
  const key = `${bookId}:${encoding}:${stat.mtimeMs}`;

  const cached = cache.get(bookId);
  if (cached?.key === key) return cached.text;

  const buffer = await fsp.readFile(filePath);
  const text = iconv.decode(buffer, encoding);

  cache.delete(bookId); // re-insert at the end for simple LRU-ish ordering
  cache.set(bookId, { key, text });
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return text;
}

export interface TextChunkResult {
  text: string;
  chunkIndex: number;
  totalChunks: number;
}

export async function getTextChunk(
  bookId: string,
  filePath: string,
  encoding: string,
  chunkIndex: number
): Promise<TextChunkResult> {
  const fullText = await getDecodedText(bookId, filePath, encoding);
  const totalChunks = Math.max(1, Math.ceil(fullText.length / TEXT_CHUNK_SIZE));
  const clampedIndex = Math.min(Math.max(0, chunkIndex), totalChunks - 1);
  const start = clampedIndex * TEXT_CHUNK_SIZE;
  const text = fullText.slice(start, start + TEXT_CHUNK_SIZE);
  return { text, chunkIndex: clampedIndex, totalChunks };
}
