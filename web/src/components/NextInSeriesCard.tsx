import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type Book } from "../api/client.js";

export default function NextInSeriesCard({ book }: { book: Book }) {
  const { data: series } = useQuery({
    queryKey: ["series", book.seriesId],
    queryFn: () => api.seriesDetail(book.seriesId!),
    enabled: !!book.seriesId,
  });

  if (!series) return null;
  const index = series.books.findIndex((b) => b.id === book.id);
  const next = index >= 0 ? series.books[index + 1] : undefined;
  if (!next) return null;

  return (
    <div className="next-in-series">
      <div className="next-in-series-cover">
        {next.hasCover ? (
          <img src={api.coverUrl(next.id, next.updatedAt)} alt="" />
        ) : (
          <div className="book-cover-placeholder">
            <span>{next.format}</span>
          </div>
        )}
      </div>
      <div className="next-in-series-info">
        <p className="muted">Next in {series.title}</p>
        <p className="next-in-series-title">{next.title}</p>
        <Link to={`/reader/${next.id}`}>
          <button>Start reading →</button>
        </Link>
      </div>
    </div>
  );
}
