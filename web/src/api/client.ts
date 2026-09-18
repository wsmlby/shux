export interface User {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "USER";
}

export interface Book {
  id: string;
  path: string;
  format: "PDF" | "EPUB" | "TXT";
  title: string;
  author: string | null;
  description: string | null;
  isbn: string | null;
  publishedAt: string | null;
  hasCover: boolean;
  fileSize: number;
  addedAt: string;
  updatedAt: string;
  seriesId: string | null;
  series: { id: string; title: string } | null;
  volumeNumber: number | null;
  volumeLabel: string | null;
}

export interface SeriesSummary {
  id: string;
  title: string;
  volumeCount: number;
  coverBookId: string | null;
  coverUpdatedAt: string | null;
}

export interface SeriesDetail {
  id: string;
  title: string;
  books: Book[];
}

export interface Progress {
  location: string | null;
  percent: number;
}

export interface ContinueReadingBook extends Book {
  progressPercent: number;
}

export interface BookUpdate {
  title?: string;
  author?: string | null;
  description?: string | null;
  isbn?: string | null;
  publishedAt?: string | null;
  volumeLabel?: string | null;
  coverUrl?: string;
}

export interface MetadataLookupResult {
  title?: string;
  author?: string;
  description?: string;
  coverUrl?: string;
  publishedAt?: string;
  isbn?: string;
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Our own routes send { error: "<specific message>" }. Fastify's default
    // handler for an unhandled exception sends { error: "Internal Server
    // Error", message: "<actual cause>" } — prefer the specific one.
    const message =
      (res.status >= 500 && typeof body.message === "string" && body.message) ||
      body.error ||
      body.message ||
      res.statusText ||
      `Request failed (${res.status})`;
    console.error(`API error on ${options.method ?? "GET"} ${path}:`, res.status, body);
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  bootstrapCheck: () => request<{ needsSetup: boolean }>("/auth/bootstrap-check"),
  register: (data: { email: string; name: string; password: string; role?: "ADMIN" | "USER" }) =>
    request<User>("/auth/register", { method: "POST", body: JSON.stringify(data) }),
  login: (data: { email: string; password: string }) =>
    request<User>("/auth/login", { method: "POST", body: JSON.stringify(data) }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
  me: () => request<User>("/auth/me"),

  users: () => request<User[]>("/users"),
  deleteUser: (id: string) => request<{ ok: true }>(`/users/${id}`, { method: "DELETE" }),

  books: (params?: { q?: string; format?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.q) searchParams.set("q", params.q);
    if (params?.format) searchParams.set("format", params.format);
    const qs = searchParams.toString();
    return request<Book[]>(`/books${qs ? `?${qs}` : ""}`);
  },
  book: (id: string) => request<Book>(`/books/${id}`),
  updateBook: (id: string, data: BookUpdate) =>
    request<Book>(`/books/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  lookupBookMetadata: (id: string, hint?: { title?: string; author?: string }) =>
    request<MetadataLookupResult>(`/books/${id}/lookup-metadata`, {
      method: "POST",
      ...(hint ? { body: JSON.stringify(hint) } : {}),
    }),
  regenerateCover: (id: string) => request<Book>(`/books/${id}/regenerate-cover`, { method: "POST" }),
  scan: (options?: { full?: boolean }) =>
    request<{ scanned: number; added: number; removed: number; refreshed: number }>("/scan", {
      method: "POST",
      ...(options?.full ? { body: JSON.stringify({ full: true }) } : {}),
    }),
  resetMetadata: () => request<{ reset: number }>("/books/reset-metadata", { method: "POST" }),

  series: () => request<SeriesSummary[]>("/series"),
  seriesDetail: (id: string) => request<SeriesDetail>(`/series/${id}`),
  updateSeries: (id: string, data: { title: string }) =>
    request<SeriesDetail>(`/series/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  ungroupSeries: (id: string) => request<{ ungrouped: number }>(`/series/${id}/ungroup`, { method: "POST" }),
  regenerateSeriesCovers: (id: string) =>
    request<{ total: number; regenerated: number; failed: number; skipped: number }>(
      `/series/${id}/regenerate-covers`,
      { method: "POST" }
    ),

  progress: (bookId: string) => request<Progress>(`/books/${bookId}/progress`),
  saveProgress: (bookId: string, data: Progress) =>
    request<Progress>(`/books/${bookId}/progress`, { method: "PUT", body: JSON.stringify(data) }),
  resetProgress: (bookId: string) => request<Progress>(`/books/${bookId}/progress`, { method: "DELETE" }),
  continueReading: () => request<ContinueReadingBook[]>("/continue-reading"),

  // updatedAt busts the cover route's 24h cache so a just-edited or
  // just-regenerated cover shows up immediately instead of the stale image.
  coverUrl: (bookId: string, updatedAt?: string) =>
    `/api/books/${bookId}/cover${updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : ""}`,
  fileUrl: (bookId: string) => `/api/books/${bookId}/file`,
};

export { ApiError };
