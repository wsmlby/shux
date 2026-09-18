import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireAuth, requireAdmin } from "../auth/guards.js";
import { saveCover } from "../books/scanner.js";
import { extractPdfCover, PopplerNotInstalledError } from "../books/parsers/pdf.js";

export default async function seriesRoutes(app: FastifyInstance) {
  app.get("/api/series", { preHandler: requireAuth }, async () => {
    const series = await prisma.series.findMany({
      include: {
        books: {
          select: { id: true, hasCover: true, volumeNumber: true, updatedAt: true },
          orderBy: { volumeNumber: "asc" },
        },
      },
      orderBy: { title: "asc" },
    });

    return series.map((s) => {
      const cover = s.books.find((b) => b.hasCover);
      return {
        id: s.id,
        title: s.title,
        volumeCount: s.books.length,
        // null (not just "no book has one") when nothing has a cover — the
        // frontend renders a placeholder for null and otherwise assumes the id
        // it got back actually has an image to fetch.
        coverBookId: cover?.id ?? null,
        // Cache-busts the cover URL so a just-regenerated image shows up
        // immediately instead of the stale one under the 24h cache header.
        coverUpdatedAt: cover?.updatedAt.toISOString() ?? null,
      };
    });
  });

  app.get<{ Params: { id: string } }>("/api/series/:id", { preHandler: requireAuth }, async (request, reply) => {
    const series = await prisma.series.findUnique({
      where: { id: request.params.id },
      include: { books: { orderBy: { volumeNumber: "asc" } } },
    });
    if (!series) return reply.code(404).send({ error: "Not found" });
    return series;
  });

  app.patch<{ Params: { id: string }; Body: { title?: string } }>(
    "/api/series/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const title = request.body?.title?.trim();
      if (!title) return reply.code(400).send({ error: "title must be a non-empty string" });

      const existing = await prisma.series.findUnique({ where: { id: request.params.id } });
      if (!existing) return reply.code(404).send({ error: "Not found" });

      try {
        return await prisma.series.update({ where: { id: existing.id }, data: { title } });
      } catch {
        return reply.code(409).send({ error: `A series named "${title}" already exists` });
      }
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/series/:id/ungroup",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const series = await prisma.series.findUnique({
        where: { id: request.params.id },
        include: { books: { select: { id: true } } },
      });
      if (!series) return reply.code(404).send({ error: "Not found" });

      request.log.info({ seriesId: series.id, title: series.title, books: series.books.length }, "ungrouping series");

      await prisma.book.updateMany({
        where: { seriesId: series.id },
        data: { seriesId: null, volumeNumber: null, volumeLabel: null, seriesOverride: true },
      });
      await prisma.series.delete({ where: { id: series.id } });

      return { ungrouped: series.books.length };
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/series/:id/regenerate-covers",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const series = await prisma.series.findUnique({
        where: { id: request.params.id },
        include: { books: { select: { id: true, path: true, format: true } } },
      });
      if (!series) return reply.code(404).send({ error: "Not found" });

      const pdfBooks = series.books.filter((b) => b.format === "PDF");
      request.log.info(
        { seriesId: series.id, title: series.title, pdfBooks: pdfBooks.length },
        "bulk regenerating series covers"
      );

      let regenerated = 0;
      let failed = 0;
      for (const book of pdfBooks) {
        try {
          const cover = await extractPdfCover(book.path);
          await saveCover(book.id, cover);
          await prisma.book.update({ where: { id: book.id }, data: { hasCover: true } });
          regenerated++;
        } catch (err) {
          if (err instanceof PopplerNotInstalledError) {
            request.log.error({ seriesId: series.id }, "poppler-utils missing, aborting bulk cover regeneration");
            return reply.code(502).send({
              error:
                "poppler-utils (pdftoppm) is not installed in this container. Rebuild and redeploy the Docker " +
                "image (docker compose up -d --build), then try again.",
              regenerated,
              failed: pdfBooks.length - regenerated,
            });
          }
          request.log.error({ err, bookId: book.id }, "cover regeneration failed for one book in bulk run");
          failed++;
        }
      }

      return { total: pdfBooks.length, regenerated, failed, skipped: series.books.length - pdfBooks.length };
    }
  );
}
