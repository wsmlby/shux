import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireAuth, requireAdmin } from "../auth/guards.js";
import { scanLibrary, resetAllMetadata, saveCover } from "./scanner.js";
import { fetchOpenLibraryMetadata } from "./metadata/openLibrary.js";
import { extractPdfCover, PopplerNotInstalledError } from "./parsers/pdf.js";
import { coversDir } from "../config.js";
import { isValidTxtEncoding } from "./textEncodings.js";
import { getTextChunk } from "./textChunks.js";

const MIME: Record<string, string> = {
  PDF: "application/pdf",
  EPUB: "application/epub+zip",
  TXT: "text/plain",
};

export default async function bookRoutes(app: FastifyInstance) {
  app.get("/api/books", { preHandler: requireAuth }, async (request) => {
    const { q, format } = request.query as { q?: string; format?: string };
    const books = await prisma.book.findMany({
      where: {
        ...(format ? { format: format.toUpperCase() } : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q } },
                { author: { contains: q } },
              ],
            }
          : {}),
      },
      include: { series: { select: { id: true, title: true } } },
      orderBy: { title: "asc" },
    });
    return books;
  });

  app.get<{ Params: { id: string } }>(
    "/api/books/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const book = await prisma.book.findUnique({
        where: { id: request.params.id },
        include: { series: { select: { id: true, title: true } } },
      });
      if (!book) return reply.code(404).send({ error: "Not found" });
      return book;
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/books/:id/cover",
    { preHandler: requireAuth },
    async (request, reply) => {
      const book = await prisma.book.findUnique({ where: { id: request.params.id } });
      if (!book) return reply.code(404).send({ error: "Not found" });

      const coverPath = path.join(coversDir, `${book.id}.jpg`);
      if (!book.hasCover || !fs.existsSync(coverPath)) {
        return reply.code(404).send({ error: "No cover" });
      }
      reply.header("Cache-Control", "public, max-age=86400");
      return reply.type("image/jpeg").send(fs.createReadStream(coverPath));
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/books/:id/file",
    { preHandler: requireAuth },
    async (request, reply) => {
      const book = await prisma.book.findUnique({ where: { id: request.params.id } });
      if (!book) return reply.code(404).send({ error: "Not found" });

      const stat = await fsp.stat(book.path).catch(() => null);
      if (!stat) return reply.code(404).send({ error: "File missing on disk" });

      // TxtReader reads via /text-chunk (below), not this endpoint — this
      // charset is only relevant to other consumers of raw file bytes (e.g.
      // opening the file URL directly in a browser tab, or downloading it).
      const mime = book.format === "TXT" ? `${MIME.TXT}; charset=${book.encoding}` : MIME[book.format];
      const range = request.headers.range;

      if (range) {
        const match = /bytes=(\d*)-(\d*)/.exec(range);
        const start = match?.[1] ? parseInt(match[1], 10) : 0;
        const end = match?.[2] ? parseInt(match[2], 10) : stat.size - 1;

        reply.code(206);
        reply.header("Content-Range", `bytes ${start}-${end}/${stat.size}`);
        reply.header("Accept-Ranges", "bytes");
        reply.header("Content-Length", end - start + 1);
        reply.type(mime);
        return reply.send(fs.createReadStream(book.path, { start, end }));
      }

      reply.header("Accept-Ranges", "bytes");
      reply.header("Content-Length", stat.size);
      reply.type(mime);
      return reply.send(fs.createReadStream(book.path));
    }
  );

  app.get<{ Params: { id: string }; Querystring: { index?: string } }>(
    "/api/books/:id/text-chunk",
    { preHandler: requireAuth },
    async (request, reply) => {
      const book = await prisma.book.findUnique({ where: { id: request.params.id } });
      if (!book) return reply.code(404).send({ error: "Not found" });
      if (book.format !== "TXT") return reply.code(400).send({ error: "Not a TXT book" });

      const stat = await fsp.stat(book.path).catch(() => null);
      if (!stat) return reply.code(404).send({ error: "File missing on disk" });

      const requestedIndex = parseInt(request.query.index ?? "0", 10);
      const chunkIndex = Number.isFinite(requestedIndex) && requestedIndex >= 0 ? requestedIndex : 0;

      try {
        return await getTextChunk(book.id, book.path, book.encoding, chunkIndex);
      } catch (err) {
        request.log.error({ err, bookId: book.id, encoding: book.encoding }, "failed to decode TXT chunk");
        return reply.code(500).send({ error: "Failed to decode this file with its configured encoding" });
      }
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/api/books/:id",
    { preHandler: requireAdmin },
    async (request) => {
      await prisma.book.delete({ where: { id: request.params.id } }).catch(() => {});
      return { ok: true };
    }
  );

  interface BookUpdateBody {
    title?: string;
    author?: string | null;
    description?: string | null;
    isbn?: string | null;
    publishedAt?: string | null;
    volumeLabel?: string | null;
    coverUrl?: string;
    encoding?: string;
  }

  const EDITABLE_STRING_FIELDS = ["author", "description", "isbn", "publishedAt", "volumeLabel"] as const;

  app.patch<{ Params: { id: string }; Body: BookUpdateBody }>(
    "/api/books/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const book = await prisma.book.findUnique({ where: { id: request.params.id } });
      if (!book) return reply.code(404).send({ error: "Not found" });

      const body = request.body ?? {};
      const data: Record<string, unknown> = {};

      if (body.title !== undefined) {
        if (typeof body.title !== "string" || !body.title.trim()) {
          return reply.code(400).send({ error: "title must be a non-empty string" });
        }
        data.title = body.title.trim();
      }

      for (const field of EDITABLE_STRING_FIELDS) {
        const value = body[field];
        if (value === undefined) continue;
        if (value !== null && typeof value !== "string") {
          return reply.code(400).send({ error: `${field} must be a string or null` });
        }
        data[field] = value === null ? null : value.trim() || null;
      }

      if (body.encoding !== undefined) {
        if (book.format !== "TXT") {
          return reply.code(400).send({ error: "encoding only applies to TXT books" });
        }
        if (typeof body.encoding !== "string" || !isValidTxtEncoding(body.encoding)) {
          return reply.code(400).send({ error: "Unsupported text encoding" });
        }
        data.encoding = body.encoding;
      }

      if (body.coverUrl) {
        try {
          const response = await fetch(body.coverUrl);
          if (!response.ok) throw new Error(`fetch failed (${response.status})`);
          const buffer = Buffer.from(await response.arrayBuffer());
          await saveCover(book.id, buffer);
          data.hasCover = true;
        } catch (err) {
          request.log.error({ err, coverUrl: body.coverUrl }, "failed to download cover for manual edit");
          return reply.code(502).send({ error: "Failed to download the cover image from that URL" });
        }
      }

      const updated = await prisma.book.update({
        where: { id: book.id },
        data,
        include: { series: { select: { id: true, title: true } } },
      });
      return updated;
    }
  );

  app.post<{ Params: { id: string }; Body: { title?: string; author?: string } | undefined }>(
    "/api/books/:id/lookup-metadata",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const book = await prisma.book.findUnique({ where: { id: request.params.id } });
      if (!book) return reply.code(404).send({ error: "Not found" });

      const title = request.body?.title?.trim() || book.title;
      const author = request.body?.author?.trim() || book.author || undefined;

      request.log.info({ bookId: book.id, title, author }, "manual Open Library lookup requested");
      const result = await fetchOpenLibraryMetadata(title, author);
      if (!result) return reply.code(404).send({ error: "No match found on Open Library for that title/author" });
      return result;
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/books/:id/regenerate-cover",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const book = await prisma.book.findUnique({ where: { id: request.params.id } });
      if (!book) return reply.code(404).send({ error: "Not found" });
      if (book.format !== "PDF") {
        return reply.code(400).send({ error: "Cover regeneration only applies to PDF books" });
      }

      request.log.info({ bookId: book.id, path: book.path }, "regenerating PDF cover");
      let cover: Buffer;
      try {
        cover = await extractPdfCover(book.path);
      } catch (err) {
        request.log.error({ err, bookId: book.id }, "PDF cover regeneration failed");
        if (err instanceof PopplerNotInstalledError) {
          return reply.code(502).send({
            error:
              "poppler-utils (pdftoppm) is not installed in this container. Rebuild and redeploy the Docker " +
              "image (docker compose up -d --build), then try again.",
          });
        }
        return reply.code(502).send({
          error: "Could not extract a cover from this PDF's first page — the file may be corrupted or unreadable.",
        });
      }

      await saveCover(book.id, cover);
      const updated = await prisma.book.update({
        where: { id: book.id },
        data: { hasCover: true },
        include: { series: { select: { id: true, title: true } } },
      });
      return updated;
    }
  );

  app.post<{ Body: { full?: boolean } | undefined }>(
    "/api/scan",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const full = request.body?.full === true;
      request.log.info({ user: request.user!.email, full }, "library scan requested");
      try {
        const result = await scanLibrary(request.log, { full });
        request.log.info(result, "library scan finished");
        return result;
      } catch (err) {
        request.log.error({ err }, "library scan failed");
        return reply.code(500).send({
          error: err instanceof Error ? err.message : "Scan failed, see server logs",
        });
      }
    }
  );

  app.post("/api/books/reset-metadata", { preHandler: requireAdmin }, async (request, reply) => {
    request.log.info({ user: request.user!.email }, "metadata reset requested");
    try {
      const result = await resetAllMetadata(request.log);
      request.log.info(result, "metadata reset finished");
      return result;
    } catch (err) {
      request.log.error({ err }, "metadata reset failed");
      return reply.code(500).send({
        error: err instanceof Error ? err.message : "Reset failed, see server logs",
      });
    }
  });
}
