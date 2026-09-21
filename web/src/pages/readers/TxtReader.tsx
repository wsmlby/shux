import { useEffect, useRef, useState } from "react";
import { api, type Book } from "../../api/client.js";
import NextInSeriesCard from "../../components/NextInSeriesCard.js";
import GoToMenu from "../../components/GoToMenu.js";

interface Props {
  book: Book;
  initialLocation: string | null;
  fullscreen: boolean;
}

// Plain text has no natural page breaks, so we treat fixed-size chunks of
// the *decoded* text as "pages". Pagination happens server-side (see
// server/src/books/textChunks.ts) — the server decodes the whole file with
// the book's configured encoding and slices the resulting string, so a page
// boundary is always a real character boundary regardless of encoding.
// Chunking raw file bytes client-side (the original approach) only ever
// worked for UTF-8's self-synchronizing byte structure; encodings like
// GBK/Big5/Shift_JIS would decode whole pages as garbage whenever a byte
// range happened to start mid-character.
export default function TxtReader({ book, initialLocation, fullscreen }: Props) {
  const [chunkIndex, setChunkIndex] = useState(() => {
    const parsed = initialLocation ? parseInt(initialLocation, 10) : 0;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  });
  // A placeholder until the first chunk response reports the real count —
  // the server is the only side that knows the decoded character length.
  const [totalChunks, setTotalChunks] = useState(1);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [goToInput, setGoToInput] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setError(null);

    api
      .textChunk(book.id, chunkIndex)
      .then((chunk) => {
        if (cancelled) return;
        setText(chunk.text);
        setTotalChunks(chunk.totalChunks);
        // The server clamps an out-of-range index (e.g. a location saved
        // before the file changed or before the encoding was fixed) —
        // resync so Prev/Next bounds and the page number reflect where we
        // actually landed.
        if (chunk.chunkIndex !== chunkIndex) setChunkIndex(chunk.chunkIndex);
        containerRef.current?.scrollTo({ top: 0 });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load text chunk:", err);
        setError("Failed to load this part of the file.");
      });

    return () => {
      cancelled = true;
    };
  }, [book.id, book.encoding, chunkIndex]);

  useEffect(() => {
    // Unrounded: a long file can have many chunks, so early progress can
    // round to 0% and vanish from the continue-reading deck (it only lists
    // percent > 0) despite the user really being partway through.
    const percent = (chunkIndex / Math.max(totalChunks - 1, 1)) * 100;
    const timer = setTimeout(() => {
      api.saveProgress(book.id, { location: String(chunkIndex), percent }).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [book.id, chunkIndex, totalChunks]);

  function goTo(delta: number) {
    setChunkIndex((i) => Math.min(Math.max(0, i + delta), totalChunks - 1));
  }

  function goToPage(target: number) {
    setChunkIndex(Math.min(Math.max(0, target - 1), totalChunks - 1));
  }

  function handleTapZone(e: React.MouseEvent<HTMLDivElement>) {
    if (!fullscreen) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest?.("a")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX - rect.left < rect.width / 2) goTo(-1);
    else goTo(1);
  }

  useEffect(() => {
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") goTo(-1);
      if (e.key === "ArrowRight") goTo(1);
    }
    document.addEventListener("keyup", onKeyUp);
    return () => document.removeEventListener("keyup", onKeyUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalChunks]);

  return (
    <div className="txt-reader-shell">
      <div ref={containerRef} className="txt-reader" onClick={handleTapZone}>
        {error ? (
          <p className="error">{error}</p>
        ) : text === null ? (
          <p>Loading…</p>
        ) : (
          <pre className="txt-content">{text}</pre>
        )}
      </div>
      <div className="pdf-controls">
        <GoToMenu>
          {(close) => (
            <>
              <button
                onClick={() => {
                  goToPage(1);
                  close();
                }}
              >
                First page
              </button>
              <button
                onClick={() => {
                  goToPage(totalChunks);
                  close();
                }}
              >
                Last page
              </button>
              <div className="goto-divider" />
              <form
                className="goto-panel-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const target = parseInt(goToInput, 10);
                  if (Number.isFinite(target)) goToPage(target);
                  setGoToInput("");
                  close();
                }}
              >
                <input
                  type="number"
                  min={1}
                  max={totalChunks}
                  placeholder={`1–${totalChunks}`}
                  value={goToInput}
                  onChange={(e) => setGoToInput(e.target.value)}
                  autoFocus
                />
                <button type="submit">Go</button>
              </form>
            </>
          )}
        </GoToMenu>
        <div className="controls-scroll">
          <button onClick={() => goTo(-1)} disabled={chunkIndex <= 0}>
            ← Prev
          </button>
          <span>
            Page {chunkIndex + 1} of {totalChunks}
          </span>
          <button onClick={() => goTo(1)} disabled={chunkIndex >= totalChunks - 1}>
            Next →
          </button>
        </div>
      </div>
      {chunkIndex >= totalChunks - 1 && book.seriesId && <NextInSeriesCard book={book} />}
    </div>
  );
}
