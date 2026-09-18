import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";

export default function SeriesEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: series, isLoading } = useQuery({
    queryKey: ["series", id],
    queryFn: () => api.seriesDetail(id!),
    enabled: !!id,
  });

  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [ungrouping, setUngrouping] = useState(false);
  const [ungroupError, setUngroupError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [regenerateMessage, setRegenerateMessage] = useState<string | null>(null);

  useEffect(() => {
    if (series) setTitle(series.title);
  }, [series]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.updateSeries(id, { title });
      queryClient.invalidateQueries({ queryKey: ["series"] });
      navigate(`/series/${id}`);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Save failed — check the server logs.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUngroup() {
    if (!id || !series) return;
    if (
      !confirm(
        `Ungroup "${series.title}"? Its ${series.books.length} volumes become standalone books again. ` +
          "This sticks — a future scan won't automatically regroup them (reset metadata clears that)."
      )
    ) {
      return;
    }
    setUngrouping(true);
    setUngroupError(null);
    try {
      await api.ungroupSeries(id);
      queryClient.invalidateQueries({ queryKey: ["series"] });
      queryClient.invalidateQueries({ queryKey: ["books"] });
      navigate("/");
    } catch (err) {
      setUngroupError(err instanceof ApiError ? err.message : "Ungroup failed — check the server logs.");
      setUngrouping(false);
    }
  }

  async function handleRegenerateCovers() {
    if (!id || !series) return;
    const pdfCount = series.books.filter((b) => b.format === "PDF").length;
    if (pdfCount === 0) return;
    if (!confirm(`Regenerate covers for all ${pdfCount} PDF volumes in "${series.title}"? This overwrites any existing covers for them.`)) {
      return;
    }
    setRegenerating(true);
    setRegenerateError(null);
    setRegenerateMessage(null);
    try {
      const result = await api.regenerateSeriesCovers(id);
      setRegenerateMessage(
        `Regenerated ${result.regenerated} of ${result.total} PDF covers` +
          (result.failed > 0 ? ` (${result.failed} failed — check the server logs).` : ".")
      );
      queryClient.invalidateQueries({ queryKey: ["series"] });
      queryClient.invalidateQueries({ queryKey: ["books"] });
    } catch (err) {
      setRegenerateError(err instanceof ApiError ? err.message : "Regeneration failed — check the server logs.");
    } finally {
      setRegenerating(false);
    }
  }

  if (user?.role !== "ADMIN") return <Navigate to="/" replace />;
  if (isLoading || !series) return <main className="container">Loading…</main>;

  const pdfVolumeCount = series.books.filter((b) => b.format === "PDF").length;

  return (
    <main className="container edit-page">
      <Link to={`/series/${series.id}`} className="link-button">
        ← {series.title}
      </Link>
      <h1>Edit series</h1>

      <form className="edit-form" onSubmit={handleSave}>
        {saveError && <p className="error">{saveError}</p>}
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <div className="book-actions">
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          <Link to={`/series/${series.id}`} className="link-button">
            Cancel
          </Link>
        </div>
      </form>

      {pdfVolumeCount > 0 && (
        <section>
          <h2>Covers</h2>
          <p className="muted">Re-extract the cover from the first page of each PDF volume ({pdfVolumeCount}).</p>
          {regenerateMessage && <p className="muted">{regenerateMessage}</p>}
          {regenerateError && <p className="error">{regenerateError}</p>}
          <button className="secondary" onClick={handleRegenerateCovers} disabled={regenerating}>
            {regenerating ? "Regenerating…" : "Regenerate all covers"}
          </button>
        </section>
      )}

      <section className="danger-zone">
        <h2>Ungroup series</h2>
        <p className="muted">
          Removes all {series.books.length} volumes from this series and deletes it. The volumes and their reading
          progress are not affected — they just go back to being standalone books.
        </p>
        {ungroupError && <p className="error">{ungroupError}</p>}
        <button className="danger" onClick={handleUngroup} disabled={ungrouping}>
          {ungrouping ? "Ungrouping…" : "Ungroup series"}
        </button>
      </section>

      <h2>Volumes</h2>
      <ul className="edit-volume-list">
        {series.books.map((b) => (
          <li key={b.id}>
            <Link to={`/books/${b.id}`}>{b.title}</Link>
            {b.volumeLabel && <span className="muted"> — Vol. {b.volumeLabel}</span>}
          </li>
        ))}
      </ul>
    </main>
  );
}
