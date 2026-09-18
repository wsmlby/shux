import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { hashPassword, verifyPassword } from "./password.js";
import { requireAuth } from "./guards.js";
import { COOKIE_NAME } from "./plugin.js";
import { config } from "../config.js";

interface RegisterBody {
  email: string;
  name: string;
  password: string;
  role?: "ADMIN" | "USER";
}

interface LoginBody {
  email: string;
  password: string;
}

export default async function authRoutes(app: FastifyInstance) {
  app.get("/api/auth/bootstrap-check", async () => {
    const count = await prisma.user.count();
    return { needsSetup: count === 0 };
  });

  app.post<{ Body: RegisterBody }>("/api/auth/register", async (request, reply) => {
    const { email, name, password } = request.body;
    if (!email || !name || !password || password.length < 8) {
      return reply.code(400).send({ error: "email, name and a password of 8+ characters are required" });
    }

    const userCount = await prisma.user.count();
    const isFirstUser = userCount === 0;

    if (!isFirstUser) {
      // Only an authenticated admin may create additional users.
      if (!request.user || request.user.role !== "ADMIN") {
        return reply.code(403).send({ error: "Only an admin can create new users" });
      }
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.code(409).send({ error: "Email already registered" });
    }

    const role = isFirstUser ? "ADMIN" : request.body.role === "ADMIN" ? "ADMIN" : "USER";
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, name, passwordHash, role },
    });

    if (isFirstUser) {
      const sessionId = await app.createSession(user.id);
      reply.setCookie(COOKIE_NAME, sessionId, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: config.sessionTtlDays * 24 * 60 * 60,
      });
    }

    return { id: user.id, email: user.email, name: user.name, role: user.role };
  });

  app.post<{ Body: LoginBody }>("/api/auth/login", async (request, reply) => {
    const { email, password } = request.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    const sessionId = await app.createSession(user.id);
    reply.setCookie(COOKIE_NAME, sessionId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: config.sessionTtlDays * 24 * 60 * 60,
    });

    return { id: user.id, email: user.email, name: user.name, role: user.role };
  });

  app.post("/api/auth/logout", { preHandler: requireAuth }, async (request, reply) => {
    const sid = request.cookies[COOKIE_NAME];
    if (sid) await app.destroySession(sid);
    reply.clearCookie(COOKIE_NAME, { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", { preHandler: requireAuth }, async (request) => {
    return request.user;
  });

  app.patch<{ Body: { currentPassword?: string; newPassword?: string } }>(
    "/api/auth/password",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { currentPassword, newPassword } = request.body ?? {};
      if (!currentPassword || !newPassword || newPassword.length < 8) {
        return reply
          .code(400)
          .send({ error: "currentPassword and a newPassword of 8+ characters are required" });
      }

      const user = await prisma.user.findUnique({ where: { id: request.user!.id } });
      if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
        return reply.code(401).send({ error: "Current password is incorrect" });
      }

      const passwordHash = await hashPassword(newPassword);
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
      return { ok: true };
    }
  );
}
