import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type Book, type SeriesSummary } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";
import BookCard from "../components/BookCard.js";
import SeriesCard from "../components/SeriesCard.js";
import DeckCard from "../components/DeckCard.js";

type GridItem = { title: string } & ({ kind: "book"; book: Book } | { kind: "series"; series: SeriesSummary });

export default function Library() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [format, setFormat] = useState("");
  const [scanMode, setScanMode] = useState<"quick" | "full" | "reset" | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const isFiltered = !!q || !!format;

  const { data: books, isLoading: booksLoading } = useQuery({
    queryKey: ["books", q, format],
    queryFn: () => api.books({ q: q || undefined, format: format || undefined }),
  });

  const { data: series, isLoading: seriesLoading } = useQuery({
    queryKey: ["series"],
    queryFn: api.series,
    enabled: !isFiltered,
  });

  const { data: continueReading } = useQuery({
    queryKey: ["continue-reading"],
    queryFn: api.continueReading,
    enabled: !isFiltered,
  });

  const isLoading = isFiltered ? booksLoading : booksLoading || seriesLoading;

  const items: GridItem[] = isFiltered
    ? (books ?? []).map((book) => ({ kind: "book", book, title: book.title }))
    : [
        ...(books ?? [])
          .filter((b) => !b.seriesId)
          .map((book): GridItem => ({ kind: "book", book, title: book.title })),
        ...(series ?? []).map((s): GridItem => ({ kind: "series", series: s, title: s.title })),
      ].sort((a, b) => a.title.localeCompare(b.title));

  async function runScan(full: boolean) {
    setScanMode(full ? "full" : "quick");
    setScanMessage(null);
    setScanError(null);
    try {
      const result = await api.scan({ full });
      setScanMessage(
        `Scanned ${result.scanned} files — added ${result.added}, removed ${result.removed}` +
          (full ? `, refreshed ${result.refreshed}.` : ".")
      );
      queryClient.invalidateQueries({ queryKey: ["books"] });
      queryClient.invalidateQueries({ queryKey: ["series"] });
    } catch (err) {
      setScanError(err instanceof ApiError ? err.message : "Scan failed — check the server logs.");
    } finally {
      setScanMode(null);
    }
  }

  async function runResetMetadata() {
    if (
      !confirm(
        "Reset all book metadata? Titles revert to filenames, and authors, descriptions, covers, and series " +
          "groupings are cleared for every book. Reading progress and library files are not affected. Run a " +
          "Full rescan afterward to re-derive everything from scratch."
      )
    ) {
      return;
    }
    setScanMode("reset");
    setScanMessage(null);
    setScanError(null);
    try {
      const result = await api.resetMetadata();
      setScanMessage(`Reset metadata for ${result.reset} books. Run a Full rescan to re-derive it.`);
      queryClient.invalidateQueries({ queryKey: ["books"] });
      queryClient.invalidateQueries({ queryKey: ["series"] });
    } catch (err) {
      setScanError(err instanceof ApiError ? err.message : "Reset failed — check the server logs.");
    } finally {
      setScanMode(null);
    }
  }

  return (
    <main className="container">
      <div className="library-toolbar">
        <input
          className="search-input"
          placeholder="Search title or author…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="">All formats</option>
          <option value="epub">EPUB</option>
          <option value="pdf">PDF</option>
          <option value="txt">TXT</option>
        </select>
        {user?.role === "ADMIN" && (
          <>
            <button onClick={() => runScan(false)} disabled={scanMode !== null}>
              {scanMode === "quick" ? "Scanning…" : "Scan library"}
            </button>
            <button
              className="secondary"
              onClick={() => runScan(true)}
              disabled={scanMode !== null}
              title="Re-parse metadata and covers for every book, not just new files"
            >
              {scanMode === "full" ? "Rescanning…" : "Full rescan"}
            </button>
            <button
              className="danger"
              onClick={runResetMetadata}
              disabled={scanMode !== null}
              title="Clear titles, authors, covers, and series groupings back to a blank slate"
            >
              {scanMode === "reset" ? "Resetting…" : "Reset metadata"}
            </button>
          </>
        )}
      </div>
      {scanMessage && <p className="muted">{scanMessage}</p>}
      {scanError && <p className="error">{scanError}</p>}

      {!isFiltered && continueReading && continueReading.length > 0 && (
        <section className="deck-section">
          <h2>Continue Reading</h2>
          <div className="deck-row">
            {continueReading.map((book) => (
              <DeckCard key={book.id} book={book} />
            ))}
          </div>
        </section>
      )}

      {!isFiltered && <h2>Book Shelf</h2>}
      {isLoading ? (
        <p>Loading…</p>
      ) : items.length > 0 ? (
        <div className="book-grid">
          {items.map((item) =>
            item.kind === "book" ? (
              <BookCard key={`book-${item.book.id}`} book={item.book} />
            ) : (
              <SeriesCard key={`series-${item.series.id}`} series={item.series} />
            )
          )}
        </div>
      ) : (
        <p className="muted">
          No books found. {user?.role === "ADMIN" ? "Add files to your library folder and hit Scan library." : ""}
        </p>
      )}
    </main>
  );
}
