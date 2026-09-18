import type { FastifyReply, FastifyRequest } from "fastify";

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) {
    reply.code(401).send({ error: "Not authenticated" });
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) {
    reply.code(401).send({ error: "Not authenticated" });
    return;
  }
  if (request.user.role !== "ADMIN") {
    reply.code(403).send({ error: "Admin access required" });
  }
}
