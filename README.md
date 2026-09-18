# Shux

A self-hosted media server for digital books — "Plex for books." Point it at
a folder of PDF, EPUB, or TXT files and it scans them, fetches cover art and
metadata from Open Library, and serves a responsive in-browser reader with
per-user reading progress.

## Features

- **Automated ingestion** — scans a mounted library directory for `.pdf`,
  `.epub`, and `.txt` files.
- **Metadata fetching** — reads embedded EPUB/PDF metadata, rasterizes a PDF's
  first page as its cover (via `pdftoppm`), and enriches all of it (cover,
  description, publish year) from the Open Library API.
- **Multi-user accounts** — admin/user roles, each with their own reading
  progress per book.
- **Responsive web reader** — EPUB reflow via epub.js, PDF rendering via
  pdf.js, and a plain paginated view for TXT, all usable from desktop or
  mobile browsers.
- **Single Docker image** — one container serves both the API and the
  built frontend; SQLite persists to a mounted volume, no external database
  required.

Kindle formats (azw/azw3/mobi) are not supported yet — see Roadmap below.

## Quick start

```bash
cp .env.example .env   # then set a real COOKIE_SECRET
docker compose up -d --build
```

- Put your books in `./library` (created on first run, or create it
  yourself first).
- Open http://localhost:8080 — the first visitor creates the admin account.
- As the admin, click **Scan library** to ingest files, or add more users
  from the **Users** page.

Application data (SQLite DB + cached covers) lives in `./data`; back that
directory up along with `./library`.

## Local development

Requires Node.js 20+. PDF cover extraction shells out to `pdftoppm` (from
poppler-utils); install it locally (`apt install poppler-utils` /
`brew install poppler`) if you want covers outside Docker — scanning still
works without it, PDFs just won't get a generated cover.

```bash
npm install
cp server/.env.example server/.env   # if you create one; otherwise export vars inline
LIBRARY_DIR=./library DATA_DIR=./data DATABASE_URL="file:./data/shux.db" COOKIE_SECRET=dev npm run dev:server
npm run dev:web   # in a second terminal; proxies /api to the server on :8080
```

The server needs its SQLite schema migrated once before first run:

```bash
cd server
DATABASE_URL="file:../data/shux.db" npx prisma migrate deploy
```

## Project layout

- `server/` — Fastify + TypeScript API, Prisma/SQLite, library scanner,
  Open Library metadata client, book/user/progress routes.
- `web/` — React + Vite + TypeScript frontend: auth flow, library grid,
  book detail, and format-specific readers.
- `Dockerfile` / `docker-compose.yml` — single-image production build.

## Roadmap

- azw/azw3/mobi support via Calibre's `ebook-convert` (converted to EPUB on
  ingest).
- Background/scheduled library scanning (currently manual, admin-triggered).
