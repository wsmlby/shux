import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";

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

  async function handleDelete() {
    if (!id || !confirm("Remove this book from the library? The file on disk is not deleted.")) return;
    await api.deleteBook(id);
    queryClient.invalidateQueries({ queryKey: ["books"] });
    navigate("/");
  }

  if (isLoading || !book) return <main className="container">Loading…</main>;

  return (
    <main className="container book-detail">
      <div className="book-detail-cover">
        {book.hasCover ? (
          <img src={api.coverUrl(book.id)} alt="" />
        ) : (
          <div className="book-cover-placeholder large">
            <span>{book.format}</span>
          </div>
        )}
      </div>
      <div className="book-detail-info">
        <h1>{book.title}</h1>
        {book.author && <h2 className="muted">{book.author}</h2>}
        <div className="book-meta">
          <span className="badge">{book.format}</span>
          {book.publishedAt && <span>{book.publishedAt}</span>}
          {book.isbn && <span>ISBN {book.isbn}</span>}
        </div>
        {book.description && <p className="book-description">{book.description}</p>}
        <div className="book-actions">
          <button onClick={() => navigate(`/reader/${book.id}`)}>Read</button>
          {user?.role === "ADMIN" && (
            <button className="danger" onClick={handleDelete}>
              Remove from library
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
