import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireAuth } from "../auth/guards.js";

interface ProgressBody {
  location: string;
  percent: number;
}

export default async function progressRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    "/api/books/:id/progress",
    { preHandler: requireAuth },
    async (request) => {
      const progress = await prisma.readingProgress.findUnique({
        where: { userId_bookId: { userId: request.user!.id, bookId: request.params.id } },
      });
      return progress ?? { location: null, percent: 0 };
    }
  );

  app.put<{ Params: { id: string }; Body: ProgressBody }>(
    "/api/books/:id/progress",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { location, percent } = request.body;
      if (typeof location !== "string" || typeof percent !== "number") {
        return reply.code(400).send({ error: "location (string) and percent (number) are required" });
      }

      const progress = await prisma.readingProgress.upsert({
        where: { userId_bookId: { userId: request.user!.id, bookId: request.params.id } },
        update: { location, percent },
        create: { userId: request.user!.id, bookId: request.params.id, location, percent },
      });
      return progress;
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/api/books/:id/progress",
    { preHandler: requireAuth },
    async (request) => {
      await prisma.readingProgress
        .delete({ where: { userId_bookId: { userId: request.user!.id, bookId: request.params.id } } })
        .catch(() => {});
      return { location: null, percent: 0 };
    }
  );

  app.get("/api/continue-reading", { preHandler: requireAuth }, async (request) => {
    const rows = await prisma.readingProgress.findMany({
      where: { userId: request.user!.id, percent: { gt: 0, lt: 100 } },
      orderBy: { updatedAt: "desc" },
      include: { book: { include: { series: { select: { id: true, title: true } } } } },
    });
    return rows.map((row) => ({ ...row.book, progressPercent: row.percent }));
  });
}
