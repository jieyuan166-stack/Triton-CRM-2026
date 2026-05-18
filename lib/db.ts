import "server-only";

import { PrismaClient } from "@prisma/client";

// In development, hot reload re-evaluates this module, so we cache the
// PrismaClient on globalThis to avoid leaking connections. In production
// the module is loaded exactly once per worker, so we INTENTIONALLY do
// not cache to global — the singleton is the module-level `db` export.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
