// Kept in sync with server/src/books/textEncodings.ts. Every value here must
// be a label the browser's TextDecoder recognizes (WHATWG Encoding
// Standard), since TxtReader decodes chunks with `new TextDecoder(encoding)`.
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
