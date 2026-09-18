import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";
import BookCard from "../components/BookCard.js";

export default function SeriesDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const { data: series, isLoading } = useQuery({
    queryKey: ["series", id],
    queryFn: () => api.seriesDetail(id!),
    enabled: !!id,
  });

  if (isLoading || !series) return <main className="container">Loading…</main>;

  return (
    <main className="container">
      <Link to="/" className="link-button">
        ← Library
      </Link>
      <div className="series-detail-header">
        <div>
          <h1>{series.title}</h1>
          <p className="muted">{series.books.length} volumes</p>
        </div>
        {user?.role === "ADMIN" && (
          <Link to={`/series/${series.id}/edit`}>
            <button className="secondary">Edit</button>
          </Link>
        )}
      </div>
      <div className="book-grid">
        {series.books.map((book) => (
          <BookCard key={book.id} book={book} volumeLabel={book.volumeLabel ?? undefined} />
        ))}
      </div>
    </main>
  );
}
