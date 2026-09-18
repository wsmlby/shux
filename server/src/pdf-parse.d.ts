declare module "pdf-parse" {
  interface PdfParseResult {
    text: string;
    info?: Record<string, string>;
    numpages: number;
  }
  function pdfParse(data: Buffer, options?: { max?: number }): Promise<PdfParseResult>;
  export default pdfParse;
}
