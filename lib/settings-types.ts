// lib/settings-types.ts
// Shape of all *DB-stored* application settings.
// Secrets (SMTP_PASSWORD, NEXTAUTH_SECRET) NEVER live here — they stay in env.

export interface AdminProfile {
  id: string;
  name: string;
  email: string;
  /** ISO timestamp of last password change */
  passwordUpdatedAt?: string;
}

export interface EmailConfig {
  host: string;
  port: number;
  /** true = implicit TLS (port 465); false = STARTTLS (port 587) */
  secure: boolean;
  user: string;
  fromName: string;
  fromEmail: string;
  /** Whether the SMTP password env var is currently set on the server.
   *  This is a status flag — the password itself is never stored or sent. */
  passwordConfigured?: boolean;
}

/** Versioned, serialisable snapshot of the data layer. Stored inline on a
 *  BackupRecord and also written to localStorage so a restore can survive a
 *  full window reload. The shape uses `unknown[]` for the data arrays so the
 *  type module doesn't take a dependency on the full Client / Policy types
 *  — DataProvider validates+narrows the contents at hydration time. */
export interface BackupSnapshot {
  version: 1;
  capturedAt: string;
  clients: unknown[];
  policies: unknown[];
  followUps: unknown[];
}

export interface BackupRecord {
  id: string;
  filename: string;          // e.g. backup_20260506T1430.tar.gz
  kind?: "snapshot" | "database";
  restorable?: boolean;
  /** Bytes (estimated for the in-memory mock; real bytes for file uploads). */
  size: number;
  createdAt: string;         // ISO timestamp
  /** What the snapshot contained, for the UI label */
  contents: string[];        // ['Clients', 'Policies', 'Audit Logs', 'Templates']
  /** The actual restorable payload. Optional because the seed records the UI
   *  shows on first load are placeholders with no captured state — restoring
   *  one of those surfaces a friendly error rather than wiping the system. */
  data?: BackupSnapshot;
}

/** Browser localStorage key used to hand the snapshot from BackupsSection
 *  → window.location.reload() → DataProvider's hydration step. */
export const RESTORE_PENDING_KEY = "triton:restore-pending-v1";

export type EmailTemplateId = "birthday" | "renewal" | "festival";

export interface EmailTemplate {
  id: EmailTemplateId;
  label: string;
  subject: string;
  body: string;
  /** Hint chips shown under the body editor — purely informational. */
  variables: string[];
}

export interface EmailSignature {
  enabled: boolean;
  /** Plain-text fallback used as the body for clients that strip HTML, and
   *  for the existing `renderEmailBody` plain-text pipeline. Auto-derived
   *  from `html` whenever the rich editor writes — callers don't have to
   *  manage both fields. */
  text: string;
  /** Rich HTML signature. Inline-styled (no <head>/<style>) so Gmail and
   *  Outlook render it correctly without sanitising styles away. Used as
   *  the html signature segment when sending via /api/send-email. */
  html?: string;
}

export interface AppSettings {
  profile: AdminProfile;
  email: EmailConfig;
  templates: EmailTemplate[];
  signature: EmailSignature;
}
