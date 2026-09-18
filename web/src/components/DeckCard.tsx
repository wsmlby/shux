import { Link } from "react-router-dom";
import { api, type ContinueReadingBook } from "../api/client.js";

export default function DeckCard({ book }: { book: ContinueReadingBook }) {
  return (
    <Link to={`/reader/${book.id}`} className="deck-card">
      <div className="book-cover">
        {book.hasCover ? (
          <img src={api.coverUrl(book.id, book.updatedAt)} alt="" loading="lazy" />
        ) : (
          <div className="book-cover-placeholder">
            <span>{book.format}</span>
          </div>
        )}
        <div className="deck-progress-track">
          <div className="deck-progress-fill" style={{ width: `${book.progressPercent}%` }} />
        </div>
      </div>
      <div className="book-title">{book.title}</div>
      <div className="book-author">{book.progressPercent}% read</div>
    </Link>
  );
}
