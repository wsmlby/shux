import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { api, type Book } from "../../api/client.js";
import NextInSeriesCard from "../../components/NextInSeriesCard.js";

// The `pdfjs-dist` version here (see package.json) must match the version
// react-pdf bundles internally — a mismatched worker/API version makes
// pdf.js refuse to load every PDF. Bump both together.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface Props {
  book: Book;
  initialLocation: string | null;
}

type SpreadMode = "single" | "double";
const ZOOM_STEPS = [0.5, 0.65, 0.8, 1, 1.15, 1.3, 1.5, 1.75, 2, 2.5];
const ZOOM_STORAGE_KEY = "shux:pdf-view-prefs";

function loadViewPrefs(): { zoomIndex: number; mode: SpreadMode } {
  try {
    const raw = localStorage.getItem(ZOOM_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore — fall through to defaults
  }
  return { zoomIndex: ZOOM_STEPS.indexOf(1), mode: "single" };
}

export default function PdfReader({ book, initialLocation }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(() => {
    const parsed = initialLocation ? parseInt(initialLocation, 10) : 1;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  });
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });
  const [pageAspectRatio, setPageAspectRatio] = useState<number | null>(null); // height / width
  const [error, setError] = useState<string | null>(null);
  const [{ zoomIndex, mode }, setViewPrefs] = useState(loadViewPrefs);

  useEffect(() => {
    localStorage.setItem(ZOOM_STORAGE_KEY, JSON.stringify({ zoomIndex, mode }));
  }, [zoomIndex, mode]);

  useEffect(() => {
    function updateSize() {
      if (containerRef.current) {
        setContainerSize({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
      }
    }
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
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

  const step = mode === "double" ? 2 : 1;

  function goTo(delta: number) {
    setPageNumber((p) => Math.min(Math.max(1, p + delta), numPages || p + delta));
  }

  useEffect(() => {
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") goTo(-step);
      if (e.key === "ArrowRight") goTo(step);
    }
    document.addEventListener("keyup", onKeyUp);
    return () => document.removeEventListener("keyup", onKeyUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, numPages]);

  function setMode(next: SpreadMode) {
    setViewPrefs((prev) => {
      if (next === prev.mode) return prev;
      // Snap to an odd page so double-mode always shows a consistent left/right pair.
      if (next === "double" && pageNumber % 2 === 0) setPageNumber((p) => Math.max(1, p - 1));
      return { ...prev, mode: next };
    });
  }

  function zoomBy(delta: number) {
    setViewPrefs((prev) => ({ ...prev, zoomIndex: Math.min(Math.max(0, prev.zoomIndex + delta), ZOOM_STEPS.length - 1) }));
  }

  const zoom = ZOOM_STEPS[zoomIndex];
  const gap = 16;
  // Reserve room for the controls bar + its margin so "fit" doesn't force a
  // scrollbar just from the toolbar's own height.
  const CONTROLS_RESERVE = 90;
  const availableHeight = Math.max(containerSize.height - CONTROLS_RESERVE, 200);

  const fitWidthByWidth = Math.min(containerSize.width, 1000);
  const fitWidthByHeight = pageAspectRatio ? availableHeight / pageAspectRatio : Infinity;
  const baseWidth =
    mode === "double" ? (fitWidthByWidth - gap) / 2 : Math.min(fitWidthByWidth, fitWidthByHeight);
  const pageWidth = Math.round(baseWidth * zoom);

  function handlePageLoad(page: { width: number; height: number }) {
    if (page.width > 0) setPageAspectRatio(page.height / page.width);
  }

  const rightPageNumber = pageNumber + 1;
  const showRightPage = mode === "double" && rightPageNumber <= numPages;

  return (
    <div className="pdf-reader" ref={containerRef}>
      {error && <p className="error">{error}</p>}
      <Document
        file={api.fileUrl(book.id)}
        onLoadSuccess={({ numPages: n }) => {
          setError(null);
          setNumPages(n);
        }}
        onLoadError={(err) => {
          console.error("Failed to load PDF:", err);
          setError(`Failed to load PDF: ${err.message}`);
        }}
        loading={<p>Loading PDF…</p>}
      >
        <div className="pdf-pages" style={{ gap }}>
          {/* Keying by page+width+mode forces a clean remount instead of
              react-pdf reusing the previous canvas, which otherwise can be
              left blank after a page-turn's render task gets superseded. */}
          <Page
            key={`${pageNumber}-${pageWidth}-${mode}`}
            pageNumber={pageNumber}
            width={pageWidth}
            renderAnnotationLayer
            renderTextLayer
            onLoadSuccess={handlePageLoad}
            onRenderError={(err) => console.error("Failed to render PDF page:", err)}
          />
          {showRightPage && (
            <Page
              key={`${rightPageNumber}-${pageWidth}-${mode}`}
              pageNumber={rightPageNumber}
              width={pageWidth}
              renderAnnotationLayer
              renderTextLayer
              onRenderError={(err) => console.error("Failed to render PDF page:", err)}
            />
          )}
        </div>
      </Document>
      {numPages > 0 && (
        <div className="pdf-controls">
          <div className="pdf-control-group">
            <button className="icon-button" onClick={() => zoomBy(-1)} disabled={zoomIndex === 0} title="Zoom out">
              −
            </button>
            <span className="pdf-zoom-label">{Math.round(zoom * 100)}%</span>
            <button
              className="icon-button"
              onClick={() => zoomBy(1)}
              disabled={zoomIndex === ZOOM_STEPS.length - 1}
              title="Zoom in"
            >
              +
            </button>
          </div>
          <div className="pdf-control-group">
            <button
              className={mode === "single" ? "" : "secondary"}
              onClick={() => setMode("single")}
              title="Single page"
            >
              1 page
            </button>
            <button
              className={mode === "double" ? "" : "secondary"}
              onClick={() => setMode("double")}
              title="Two-page spread"
            >
              2 pages
            </button>
          </div>
          <div className="pdf-control-group">
            <button onClick={() => goTo(-step)} disabled={pageNumber <= 1}>
              ← Prev
            </button>
            <span>
              Page {pageNumber}
              {showRightPage ? `–${rightPageNumber}` : ""} of {numPages}
            </span>
            <button onClick={() => goTo(step)} disabled={(showRightPage ? rightPageNumber : pageNumber) >= numPages}>
              Next →
            </button>
          </div>
        </div>
      )}
      {numPages > 0 && (showRightPage ? rightPageNumber : pageNumber) >= numPages && book.seriesId && (
        <NextInSeriesCard book={book} />
      )}
    </div>
  );
}
