import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { api, type Book } from "../../api/client.js";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface Props {
  book: Book;
  initialLocation: string | null;
}

export default function PdfReader({ book, initialLocation }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(() => {
    const parsed = initialLocation ? parseInt(initialLocation, 10) : 1;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  });
  const [width, setWidth] = useState(800);

  useEffect(() => {
    function updateWidth() {
      if (containerRef.current) {
        setWidth(Math.min(containerRef.current.clientWidth, 1000));
      }
    }
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  useEffect(() => {
    if (numPages === 0) return;
    const timer = setTimeout(() => {
      api
        .saveProgress(book.id, {
          location: String(pageNumber),
          percent: Math.round((pageNumber / numPages) * 100),
        })
        .catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [pageNumber, numPages, book.id]);

  function goTo(delta: number) {
    setPageNumber((p) => Math.min(Math.max(1, p + delta), numPages || p + delta));
  }

  return (
    <div className="pdf-reader" ref={containerRef}>
      <Document
        file={api.fileUrl(book.id)}
        onLoadSuccess={({ numPages: n }) => setNumPages(n)}
        loading={<p>Loading PDF…</p>}
      >
        <Page pageNumber={pageNumber} width={width} renderAnnotationLayer renderTextLayer />
      </Document>
      <div className="pdf-controls">
        <button onClick={() => goTo(-1)} disabled={pageNumber <= 1}>
          ← Prev
        </button>
        <span>
          Page {pageNumber} {numPages ? `of ${numPages}` : ""}
        </span>
        <button onClick={() => goTo(1)} disabled={numPages > 0 && pageNumber >= numPages}>
          Next →
        </button>
      </div>
    </div>
  );
}
