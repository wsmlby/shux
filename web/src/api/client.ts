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
}

export interface Progress {
  location: string | null;
  percent: number;
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
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? res.statusText);
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
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<Book[]>(`/books${qs ? `?${qs}` : ""}`);
  },
  book: (id: string) => request<Book>(`/books/${id}`),
  deleteBook: (id: string) => request<{ ok: true }>(`/books/${id}`, { method: "DELETE" }),
  scan: () => request<{ scanned: number; added: number; removed: number }>("/scan", { method: "POST" }),

  progress: (bookId: string) => request<Progress>(`/books/${bookId}/progress`),
  saveProgress: (bookId: string, data: Progress) =>
    request<Progress>(`/books/${bookId}/progress`, { method: "PUT", body: JSON.stringify(data) }),

  coverUrl: (bookId: string) => `/api/books/${bookId}/cover`,
  fileUrl: (bookId: string) => `/api/books/${bookId}/file`,
};

export { ApiError };
