import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireAuth, requireAdmin } from "../auth/guards.js";
import { scanLibrary } from "./scanner.js";
import { coversDir } from "../config.js";

const MIME: Record<string, string> = {
  PDF: "application/pdf",
  EPUB: "application/epub+zip",
  TXT: "text/plain; charset=utf-8",
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
      orderBy: { title: "asc" },
    });
    return books;
  });

  app.get<{ Params: { id: string } }>(
    "/api/books/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const book = await prisma.book.findUnique({ where: { id: request.params.id } });
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

      const mime = MIME[book.format];
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

  app.delete<{ Params: { id: string } }>(
    "/api/books/:id",
    { preHandler: requireAdmin },
    async (request) => {
      await prisma.book.delete({ where: { id: request.params.id } }).catch(() => {});
      return { ok: true };
    }
  );

  app.post("/api/scan", { preHandler: requireAdmin }, async () => {
    return scanLibrary();
  });
}
