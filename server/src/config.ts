import path from "node:path";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  host: process.env.HOST ?? "0.0.0.0",
  libraryDir: required("LIBRARY_DIR", "/library"),
  dataDir: required("DATA_DIR", "/data"),
  cookieSecret: required("COOKIE_SECRET", "dev-insecure-secret-change-me"),
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 30),
  corsOrigin: process.env.CORS_ORIGIN ?? true,
};

export const coversDir = path.join(config.dataDir, "covers");
