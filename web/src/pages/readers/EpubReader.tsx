import { useEffect, useRef, useState } from "react";
import ePub from "epubjs";
import { api, type Book } from "../../api/client.js";
import NextInSeriesCard from "../../components/NextInSeriesCard.js";

interface Props {
  book: Book;
  initialLocation: string | null;
}

interface EpubLocation {
  start: {
    cfi: string;
    percentage: number;
    displayed?: { page: number; total: number };
  };
  atStart?: boolean;
  atEnd?: boolean;
}

export default function EpubReader({ book, initialLocation }: Props) {
  const viewerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renditionRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ percent: number; page?: number; total?: number } | null>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    if (!viewerRef.current) return;
    setError(null);
    setProgress(null);

    // Our file URL has no ".epub" extension (it's /api/books/:id/file), and
    // epub.js infers the input type from the URL's extension — without this
    // hint it treats an extensionless URL as an unpacked directory and 404s
    // trying to fetch container.xml as a sub-path instead of the zip itself.
    const epub = ePub(api.fileUrl(book.id), { openAs: "epub" });
    epub.on("openFailed", (err: unknown) => {
      console.error("Failed to open EPUB:", err);
      setError("Failed to open this EPUB file — it may be missing or corrupted.");
    });

    const rendition = epub.renderTo(viewerRef.current, {
      width: "100%",
      height: "100%",
      spread: "auto",
    });
    renditionRef.current = rendition;

    rendition.on("renderError", (err: unknown) => {
      console.error("Failed to render EPUB:", err);
      setError("Failed to render this EPUB file.");
    });

    rendition.display(initialLocation ?? undefined).catch((err: unknown) => {
      console.error("Failed to display EPUB:", err);
      setError("Failed to display this EPUB file.");
    });

    // epub.js only reports a real book-wide `percentage` once a locations
    // index exists — without this, it silently stays 0 forever. Generate it
    // in the background (cheap-ish; ~1 "location" per 1600 chars) and patch
    // in a fresh percentage for wherever we're currently sitting once ready.
    let cancelled = false;
    epub.ready
      .then(() => epub.locations.generate(1600))
      .then(() => {
        if (cancelled) return;
        const current = rendition.currentLocation();
        if (current?.start?.cfi) {
          const percent = Math.round(epub.locations.percentageFromCfi(current.start.cfi) * 100);
          setProgress((prev) => (prev ? { ...prev, percent } : prev));
        }
      })
      .catch(() => {
        // Locations are a progressive enhancement for the percentage
        // display; navigation still works fine without them.
      });

    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    rendition.on("relocated", (location: EpubLocation) => {
      const percent = epub.locations.length()
        ? Math.round(epub.locations.percentageFromCfi(location.start.cfi) * 100)
        : Math.round(location.start.percentage * 100);
      setProgress({ percent, page: location.start.displayed?.page, total: location.start.displayed?.total });
      setAtStart(location.atStart ?? percent <= 0);
      setAtEnd(location.atEnd ?? percent >= 100);

      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        api.saveProgress(book.id, { location: location.start.cfi, percent }).catch(() => {});
      }, 800);
    });

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") rendition.prev();
      if (e.key === "ArrowRight") rendition.next();
    }
    document.addEventListener("keyup", onKeyUp);

    return () => {
      cancelled = true;
      clearTimeout(saveTimer);
      document.removeEventListener("keyup", onKeyUp);
      renditionRef.current = null;
      epub.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  return (
    <div className="epub-reader">
      {error && <p className="error">{error}</p>}
      <div ref={viewerRef} className="epub-viewer" />
      {progress && (
        <div className="epub-controls">
          <button onClick={() => renditionRef.current?.prev()} disabled={atStart}>
            ← Prev
          </button>
          <span>{progress.page ? `Page ${progress.page} of ${progress.total} · ` : ""}{progress.percent}%</span>
          <button onClick={() => renditionRef.current?.next()} disabled={atEnd}>
            Next →
          </button>
        </div>
      )}
      {atEnd && book.seriesId && <NextInSeriesCard book={book} />}
    </div>
  );
}
