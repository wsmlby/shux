import { useEffect, useRef, useState } from "react";
import { api, type Book } from "../../api/client.js";
import NextInSeriesCard from "../../components/NextInSeriesCard.js";
import GoToMenu from "../../components/GoToMenu.js";

interface Props {
  book: Book;
  initialLocation: string | null;
  fullscreen: boolean;
}

// Plain text has no natural page breaks, so we treat fixed-size byte ranges
// as "pages" and fetch only the current one via an HTTP Range request —
// large TXT files never get loaded into the browser all at once.
const CHUNK_SIZE = 4000;

export default function TxtReader({ book, initialLocation, fullscreen }: Props) {
  const totalChunks = Math.max(1, Math.ceil(book.fileSize / CHUNK_SIZE));
  const [chunkIndex, setChunkIndex] = useState(() => {
    const parsed = initialLocation ? parseInt(initialLocation, 10) : 0;
    return Number.isFinite(parsed) && parsed >= 0 && parsed < totalChunks ? parsed : 0;
  });
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [goToInput, setGoToInput] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setError(null);

    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, book.fileSize) - 1;

    fetch(api.fileUrl(book.id), {
      credentials: "include",
      headers: { Range: `bytes=${start}-${end}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.arrayBuffer();
      })
      .then((buf) => {
        if (cancelled) return;
        // Decoded independently per chunk: a multi-byte UTF-8 character that
        // straddles a chunk boundary can render as a stray replacement
        // character right at the seam — a rare, cosmetic tradeoff for not
        // having to keep decoder/byte state across arbitrary page jumps.
        setText(new TextDecoder("utf-8").decode(buf));
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
  }, [book.id, book.fileSize, chunkIndex]);

  useEffect(() => {
    const percent = Math.round((chunkIndex / Math.max(totalChunks - 1, 1)) * 100);
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
      {chunkIndex >= totalChunks - 1 && book.seriesId && <NextInSeriesCard book={book} />}
    </div>
  );
}
