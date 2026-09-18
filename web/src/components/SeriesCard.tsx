import { Link } from "react-router-dom";
import { api, type SeriesSummary } from "../api/client.js";

export default function SeriesCard({ series }: { series: SeriesSummary }) {
  return (
    <Link to={`/series/${series.id}`} className="book-card series-card">
      <div className="book-cover series-cover-stack">
        {series.coverBookId ? (
          <img src={api.coverUrl(series.coverBookId, series.coverUpdatedAt ?? undefined)} alt="" loading="lazy" />
        ) : (
          <div className="book-cover-placeholder">
            <span>SERIES</span>
          </div>
        )}
        <span className="series-badge">{series.volumeCount}</span>
      </div>
      <div className="book-title">{series.title}</div>
      <div className="book-author">{series.volumeCount} volumes</div>
    </Link>
  );
}
