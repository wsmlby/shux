import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireAdmin } from "../auth/guards.js";
import { hashPassword } from "../auth/password.js";

export default async function userRoutes(app: FastifyInstance) {
  app.get("/api/users", { preHandler: requireAdmin }, async () => {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return users;
  });

  app.delete<{ Params: { id: string } }>(
    "/api/users/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      if (request.user!.id === request.params.id) {
        return reply.code(400).send({ error: "Cannot delete your own account" });
      }
      await prisma.user.delete({ where: { id: request.params.id } }).catch(() => {});
      return { ok: true };
    }
  );

  app.patch<{ Params: { id: string }; Body: { newPassword?: string } }>(
    "/api/users/:id/password",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const newPassword = request.body?.newPassword;
      if (!newPassword || newPassword.length < 8) {
        return reply.code(400).send({ error: "newPassword of 8+ characters is required" });
      }

      const passwordHash = await hashPassword(newPassword);
      const user = await prisma.user
        .update({ where: { id: request.params.id }, data: { passwordHash } })
        .catch(() => null);
      if (!user) return reply.code(404).send({ error: "Not found" });
      return { ok: true };
    }
  );
}
