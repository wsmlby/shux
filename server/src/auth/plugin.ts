import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { config } from "../config.js";
import type { Role } from "../types.js";

const COOKIE_NAME = "shux_sid";

declare module "fastify" {
  interface FastifyInstance {
    createSession(userId: string): Promise<string>;
    destroySession(sessionId: string): Promise<void>;
  }
}

export default fp(async function authPlugin(app: FastifyInstance) {
  app.decorate("createSession", async (userId: string) => {
    const expiresAt = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000);
    const session = await prisma.session.create({ data: { userId, expiresAt } });
    return session.id;
  });

  app.decorate("destroySession", async (sessionId: string) => {
    await prisma.session.deleteMany({ where: { id: sessionId } });
  });

  app.addHook("onRequest", async (request, reply) => {
    const sid = request.cookies[COOKIE_NAME];
    if (!sid) return;

    const session = await prisma.session.findUnique({
      where: { id: sid },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) await prisma.session.delete({ where: { id: sid } }).catch(() => {});
      reply.clearCookie(COOKIE_NAME, { path: "/" });
      return;
    }

    request.user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role as Role,
    };
  });
});

export { COOKIE_NAME };
