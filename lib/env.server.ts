// lib/env.server.ts
// Server-only env access. Importing this file from a client component
// throws at build time, preventing accidental secret exposure.
import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required env var: ${name}. Set it in .env.local (see .env.example).`
    );
  }
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

/**
 * Server-only secrets. Never serialise these to the client.
 * The `get*` accessors throw when the secret is missing so failures surface
 * at the call site instead of silently sending unauthenticated SMTP.
 */
export const serverEnv = {
  /** Gmail App Password — only read at the moment of sending an email. */
  getSmtpPassword(): string {
    return required("SMTP_PASSWORD");
  },
  getNextAuthSecret(): string {
    return required("NEXTAUTH_SECRET");
  },
  getDatabaseUrl(): string {
    return optional("DATABASE_URL", "file:./prisma/data/triton.db");
  },
};

/**
 * Public/overridable defaults. Read once at module load.
 * These are server-side defaults; the user-facing source of truth lives in
 * the database (Settings UI). Treat these as bootstrap values used the
 * very first time the app starts before any settings have been saved.
 */
export const emailDefaults = {
  host: optional("SMTP_HOST", "smtp.gmail.com"),
  port: Number(optional("SMTP_PORT", "465")),
  secure: optional("SMTP_SECURE", "true") === "true",
  user: optional("SMTP_USER", ""),
  fromName: optional("SMTP_FROM_NAME", ""),
  fromEmail: optional("SMTP_FROM_EMAIL", ""),
};
