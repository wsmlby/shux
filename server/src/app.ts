import path from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import staticFiles from "@fastify/static";
import { config } from "./config.js";
import authPlugin from "./auth/plugin.js";
import authRoutes from "./auth/routes.js";
import userRoutes from "./users/routes.js";
import bookRoutes from "./books/routes.js";
import progressRoutes from "./progress/routes.js";
import "./types.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: config.corsOrigin, credentials: true });
  await app.register(cookie, { secret: config.cookieSecret });
  await app.register(authPlugin);

  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(bookRoutes);
  await app.register(progressRoutes);

  const webDist = path.join(process.cwd(), "web-dist");
  await app.register(staticFiles, { root: webDist, wildcard: false });
  app.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith("/api/")) {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.sendFile("index.html");
  });

  return app;
}
