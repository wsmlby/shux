import { Link } from "react-router-dom";
import { api, type Book } from "../api/client.js";

export default function BookCard({ book }: { book: Book }) {
  return (
    <Link to={`/books/${book.id}`} className="book-card">
      <div className="book-cover">
        {book.hasCover ? (
          <img src={api.coverUrl(book.id)} alt="" loading="lazy" />
        ) : (
          <div className="book-cover-placeholder">
            <span>{book.format}</span>
          </div>
        )}
      </div>
      <div className="book-title">{book.title}</div>
      {book.author && <div className="book-author">{book.author}</div>}
    </Link>
  );
}
