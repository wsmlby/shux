import "fastify";

export type Role = "ADMIN" | "USER";
export type BookFormat = "PDF" | "EPUB" | "TXT";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}
