import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";
import BookCard from "../components/BookCard.js";

export default function Library() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [format, setFormat] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const { data: books, isLoading } = useQuery({
    queryKey: ["books", q, format],
    queryFn: () => api.books({ q: q || undefined, format: format || undefined }),
  });

  async function handleScan() {
    setScanning(true);
    setScanMessage(null);
    try {
      const result = await api.scan();
      setScanMessage(`Scanned ${result.scanned} files — added ${result.added}, removed ${result.removed}.`);
      queryClient.invalidateQueries({ queryKey: ["books"] });
    } finally {
      setScanning(false);
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
          <button onClick={handleScan} disabled={scanning}>
            {scanning ? "Scanning…" : "Scan library"}
          </button>
        )}
      </div>
      {scanMessage && <p className="muted">{scanMessage}</p>}

      {isLoading ? (
        <p>Loading…</p>
      ) : books && books.length > 0 ? (
        <div className="book-grid">
          {books.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      ) : (
        <p className="muted">
          No books found. {user?.role === "ADMIN" ? "Add files to your library folder and hit Scan library." : ""}
        </p>
      )}
    </main>
  );
}
