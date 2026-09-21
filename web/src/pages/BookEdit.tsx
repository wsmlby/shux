import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type Book } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";
import { TXT_ENCODINGS } from "../textEncodings.js";

interface FormState {
  title: string;
  author: string;
  description: string;
  isbn: string;
  publishedAt: string;
  volumeLabel: string;
  encoding: string;
}

function toForm(book: Book): FormState {
  return {
    title: book.title,
    author: book.author ?? "",
    description: book.description ?? "",
    isbn: book.isbn ?? "",
    publishedAt: book.publishedAt ?? "",
    volumeLabel: book.volumeLabel ?? "",
    encoding: book.encoding,
  };
}

export default function BookEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: book, isLoading } = useQuery({
    queryKey: ["book", id],
    queryFn: () => api.book(id!),
    enabled: !!id,
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [pendingCoverUrl, setPendingCoverUrl] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<{
    title?: string;
    author?: string;
    coverUrl?: string;
  } | null>(null);
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);

  useEffect(() => {
    if (book) setForm(toForm(book));
  }, [book]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleLookup() {
    if (!id || !form) return;
    setLooking(true);
    setLookupError(null);
    setLookupResult(null);
    try {
      const result = await api.lookupBookMetadata(id, {
        title: form.title || undefined,
        author: form.author || undefined,
      });
      setLookupResult(result);
      setForm((prev) =>
        prev
          ? {
              ...prev,
              title: result.title ?? prev.title,
              author: result.author ?? prev.author,
              description: result.description ?? prev.description,
              isbn: result.isbn ?? prev.isbn,
              publishedAt: result.publishedAt ?? prev.publishedAt,
            }
          : prev
      );
    } catch (err) {
      setLookupError(err instanceof ApiError ? err.message : "Lookup failed — check the server logs.");
    } finally {
      setLooking(false);
    }
  }

  async function handleRegenerateCover() {
    if (!id) return;
    setRegenerating(true);
    setRegenerateError(null);
    try {
      await api.regenerateCover(id);
      setPendingCoverUrl(null);
      await queryClient.invalidateQueries({ queryKey: ["book", id] });
      queryClient.invalidateQueries({ queryKey: ["books"] });
      queryClient.invalidateQueries({ queryKey: ["series"] });
    } catch (err) {
      setRegenerateError(err instanceof ApiError ? err.message : "Regeneration failed — check the server logs.");
    } finally {
      setRegenerating(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !form) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.updateBook(id, {
        title: form.title,
        author: form.author || null,
        description: form.description || null,
        isbn: form.isbn || null,
        publishedAt: form.publishedAt || null,
        volumeLabel: book?.seriesId ? form.volumeLabel || null : undefined,
        encoding: book?.format === "TXT" ? form.encoding : undefined,
        ...(pendingCoverUrl ? { coverUrl: pendingCoverUrl } : {}),
      });
      queryClient.invalidateQueries({ queryKey: ["book", id] });
      queryClient.invalidateQueries({ queryKey: ["books"] });
      queryClient.invalidateQueries({ queryKey: ["series"] });
      navigate(`/books/${id}`);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Save failed — check the server logs.");
    } finally {
      setSaving(false);
    }
  }

  if (user?.role !== "ADMIN") return <Navigate to="/" replace />;
  if (isLoading || !book || !form) return <main className="container">Loading…</main>;

  return (
    <main className="container edit-page">
      <Link to={`/books/${book.id}`} className="link-button">
        ← {book.title}
      </Link>
      <h1>Edit book</h1>

      <div className="edit-layout">
        <div className="edit-cover-panel">
          <div className="book-cover edit-cover">
            {pendingCoverUrl ? (
              <img src={pendingCoverUrl} alt="" />
            ) : book.hasCover ? (
              <img src={api.coverUrl(book.id, book.updatedAt)} alt="" />
            ) : (
              <div className="book-cover-placeholder">
                <span>{book.format}</span>
              </div>
            )}
          </div>
          <button type="button" onClick={handleLookup} disabled={looking}>
            {looking ? "Looking up…" : "Look up metadata"}
          </button>
          {lookupError && <p className="error">{lookupError}</p>}
          {book.format === "PDF" && (
            <>
              <button
                type="button"
                className="secondary"
                onClick={handleRegenerateCover}
                disabled={regenerating}
                title="Re-extract the cover from the PDF's first page"
              >
                {regenerating ? "Regenerating…" : "Regenerate cover"}
              </button>
              {regenerateError && <p className="error">{regenerateError}</p>}
            </>
          )}
          {lookupResult && (
            <div className="lookup-summary muted">
              <p>Found on Open Library — fields below were filled in. Review before saving.</p>
              {lookupResult.coverUrl && lookupResult.coverUrl !== pendingCoverUrl && (
                <button type="button" className="secondary" onClick={() => setPendingCoverUrl(lookupResult.coverUrl!)}>
                  Use this cover
                </button>
              )}
            </div>
          )}
        </div>

        <form className="edit-form" onSubmit={handleSave}>
          {saveError && <p className="error">{saveError}</p>}
          <label>
            Title
            <input value={form.title} onChange={(e) => set("title", e.target.value)} required />
          </label>
          <label>
            Author
            <input value={form.author} onChange={(e) => set("author", e.target.value)} />
          </label>
          <label>
            Description
            <textarea rows={6} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </label>
          <div className="edit-form-row">
            <label>
              ISBN
              <input value={form.isbn} onChange={(e) => set("isbn", e.target.value)} />
            </label>
            <label>
              Published
              <input value={form.publishedAt} onChange={(e) => set("publishedAt", e.target.value)} />
            </label>
          </div>
          {book.format === "TXT" && (
            <label>
              Text encoding
              <select value={form.encoding} onChange={(e) => set("encoding", e.target.value)}>
                {TXT_ENCODINGS.map((enc) => (
                  <option key={enc.value} value={enc.value}>
                    {enc.label}
                  </option>
                ))}
              </select>
              <span className="muted field-hint">
                If the text looks garbled when reading, the file probably isn't UTF-8 — try matching this to
                whatever encoding the file was originally saved in.
              </span>
            </label>
          )}
          {book.seriesId && (
            <label>
              Volume label
              <input value={form.volumeLabel} onChange={(e) => set("volumeLabel", e.target.value)} />
            </label>
          )}
          <div className="book-actions">
            <button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <Link to={`/books/${book.id}`} className="link-button">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
