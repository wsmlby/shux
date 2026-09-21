import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";
import NextInSeriesCard from "../components/NextInSeriesCard.js";

const FINISHED_THRESHOLD = 95;

export default function BookDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

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

  async function handleResetProgress() {
    if (!id || !confirm("Reset your reading progress for this book back to the start?")) return;
    await api.resetProgress(id);
    queryClient.invalidateQueries({ queryKey: ["progress", id] });
    queryClient.invalidateQueries({ queryKey: ["continue-reading"] });
  }

  if (isLoading || !book) return <main className="container">Loading…</main>;

  const finished = (progress?.percent ?? 0) >= FINISHED_THRESHOLD;

  return (
    <main className="container book-detail">
      <div className="book-detail-cover">
        {book.hasCover ? (
          <img src={api.coverUrl(book.id, book.updatedAt)} alt="" />
        ) : (
          <div className="book-cover-placeholder large">
            <span>{book.format}</span>
          </div>
        )}
      </div>
      <div className="book-detail-info">
        <h1>{book.title}</h1>
        {book.author && <h2 className="muted">{book.author}</h2>}
        {book.series && (
          <p className="series-link">
            Part of <Link to={`/series/${book.series.id}`}>{book.series.title}</Link>
            {book.volumeLabel ? ` — Vol. ${book.volumeLabel}` : ""}
          </p>
        )}
        <div className="book-meta">
          <span className="badge">{book.format}</span>
          {book.publishedAt && <span>{book.publishedAt}</span>}
          {book.isbn && <span>ISBN {book.isbn}</span>}
        </div>
        {book.description && <p className="book-description">{book.description}</p>}
        {!!progress?.percent && <p className="muted">{Math.round(progress.percent)}% read</p>}
        <div className="book-actions">
          <button onClick={() => navigate(`/reader/${book.id}`)}>Read</button>
          {!!progress?.percent && (
            <button className="secondary" onClick={handleResetProgress}>
              Reset progress
            </button>
          )}
          {user?.role === "ADMIN" && (
            <button className="secondary" onClick={() => navigate(`/books/${book.id}/edit`)}>
              Edit
            </button>
          )}
        </div>
        {finished && book.seriesId && <NextInSeriesCard book={book} />}
      </div>
    </main>
  );
}
