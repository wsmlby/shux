import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import EpubReader from "./readers/EpubReader.js";
import PdfReader from "./readers/PdfReader.js";
import TxtReader from "./readers/TxtReader.js";

export default function Reader() {
  const { id } = useParams<{ id: string }>();

  const { data: book, isLoading } = useQuery({
    queryKey: ["book", id],
    queryFn: () => api.book(id!),
    enabled: !!id,
  });

  const { data: progress } = useQuery({
    queryKey: ["progress", id],
    queryFn: () => api.progress(id!),
    enabled: !!id,
  });

  if (isLoading || !book) return <div className="page-loading">Loading…</div>;

  return (
    <div className="reader-shell">
      <div className="reader-topbar">
        <Link to={`/books/${book.id}`} className="link-button">
          ← {book.title}
        </Link>
      </div>
      <div className="reader-body">
        {book.format === "EPUB" && <EpubReader book={book} initialLocation={progress?.location ?? null} />}
        {book.format === "PDF" && <PdfReader book={book} initialLocation={progress?.location ?? null} />}
        {book.format === "TXT" && <TxtReader book={book} initialLocation={progress?.location ?? null} />}
      </div>
    </div>
  );
}
