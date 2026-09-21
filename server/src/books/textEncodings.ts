// Encodings a TXT book can be tagged with (see the `encoding` column on
// Book). Kept to labels the WHATWG Encoding Standard defines, since the
// browser's TextDecoder — which does the actual decoding, client-side, in
// TxtReader — only recognizes those.
export const TXT_ENCODINGS = [
  { value: "utf-8", label: "UTF-8" },
  { value: "utf-16le", label: "UTF-16 LE" },
  { value: "utf-16be", label: "UTF-16 BE" },
  { value: "gbk", label: "GBK (Chinese, Simplified)" },
  { value: "gb18030", label: "GB18030 (Chinese, Simplified)" },
  { value: "big5", label: "Big5 (Chinese, Traditional)" },
  { value: "shift_jis", label: "Shift JIS (Japanese)" },
  { value: "euc-jp", label: "EUC-JP (Japanese)" },
  { value: "euc-kr", label: "EUC-KR (Korean)" },
  { value: "windows-1252", label: "Windows-1252 (Western European)" },
  { value: "iso-8859-1", label: "ISO-8859-1 (Western European)" },
  { value: "iso-8859-15", label: "ISO-8859-15 (Western European)" },
] as const;

const VALID = new Set<string>(TXT_ENCODINGS.map((e) => e.value));

export function isValidTxtEncoding(value: string): boolean {
  return VALID.has(value);
}
