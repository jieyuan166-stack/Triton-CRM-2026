// lib/backup-service.ts
// Backup service abstraction.
// Real implementation runs server-side: a cron on the NAS produces
// backup_YYYYMMDDTHHMM.tar.gz files (see Step 13 in the project brief).
// For now we use an in-memory mock so the UI can be exercised end-to-end.

import type { BackupRecord, BackupSnapshot } from "./settings-types";

export interface BackupService {
  list(): Promise<BackupRecord[]>;
  /** Trigger a fresh backup. The caller passes the data snapshot to embed —
   *  in real production this would be the server reading from the database;
   *  in mock mode the BackupsSection reads it from DataProvider. */
  createNow(snapshot: BackupSnapshot): Promise<BackupRecord>;
  /** Restore from a given backup id. Returns the embedded snapshot so the
   *  caller can hand it to the data layer; `ok:false` means either the
   *  record is missing or the seed placeholder has no restorable payload. */
  restore(
    id: string
  ): Promise<{ ok: true; data: BackupSnapshot } | { ok: false; error: string }>;
  /** Permanently remove a backup record (and the underlying file when the
   *  NAS-backed implementation lands). */
  delete(id: string): Promise<{ ok: boolean; error?: string }>;
  /** Add a record from an uploaded .json file. The caller has already done
   *  FileReader → text; we own JSON.parse + structural validation. */
  importFromJson(
    text: string,
    filename: string
  ): Promise<{ ok: true; record: BackupRecord } | { ok: false; error: string }>;
}

/** Minimal structural check — the data arrays must be arrays of objects, but
 *  individual records are validated by DataProvider during hydration. We
 *  accept any v1 payload to keep the door open for forward-compat snapshots
 *  that add fields the validator can ignore. */
export function isValidSnapshot(v: unknown): v is BackupSnapshot {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    o.version === 1 &&
    typeof o.capturedAt === "string" &&
    Array.isArray(o.clients) &&
    Array.isArray(o.policies) &&
    Array.isArray(o.followUps)
  );
}

// === Mock implementation (in-memory) ===

function timestampLabel(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${yyyy}${mm}${dd}T${hh}${mi}`;
}

const DEFAULT_CONTENTS = ["Clients", "Policies", "Audit Logs", "Templates"];

class InMemoryBackupService implements BackupService {
  private records: BackupRecord[];

  constructor(initial: BackupRecord[]) {
    this.records = [...initial];
  }

  async list(): Promise<BackupRecord[]> {
    // newest first
    return [...this.records].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1
    );
  }

  async createNow(snapshot: BackupSnapshot): Promise<BackupRecord> {
    const now = new Date();
    const filename = `backup_${timestampLabel(now)}.json`;
    // Real bytes — JSON length is a fair approximation for the mock.
    const serialised = JSON.stringify(snapshot);
    const size = new Blob([serialised]).size;
    const record: BackupRecord = {
      id: `bak_${now.getTime().toString(36)}`,
      filename,
      size,
      createdAt: now.toISOString(),
      contents: DEFAULT_CONTENTS,
      data: snapshot,
    };
    this.records.push(record);
    return record;
  }

  async restore(id: string) {
    const found = this.records.find((r) => r.id === id);
    if (!found) return { ok: false as const, error: "Backup not found" };
    if (!found.data) {
      return {
        ok: false as const,
        error:
          "This is a placeholder backup with no captured data. Click Backup Now to create a real, restorable snapshot.",
      };
    }
    return { ok: true as const, data: found.data };
  }

  async importFromJson(text: string, filename: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return {
        ok: false as const,
        error: `Invalid JSON: ${(e as Error).message}`,
      };
    }
    if (!isValidSnapshot(parsed)) {
      return {
        ok: false as const,
        error:
          "Backup file is missing required fields (version, clients, policies, followUps).",
      };
    }
    const now = new Date();
    const record: BackupRecord = {
      id: `bak_${now.getTime().toString(36)}`,
      filename: filename || `backup_${timestampLabel(now)}.json`,
      size: new Blob([text]).size,
      createdAt: now.toISOString(),
      contents: DEFAULT_CONTENTS,
      data: parsed,
    };
    this.records.push(record);
    return { ok: true as const, record };
  }

  async delete(id: string): Promise<{ ok: boolean; error?: string }> {
    const before = this.records.length;
    this.records = this.records.filter((r) => r.id !== id);
    if (this.records.length === before) {
      return { ok: false, error: "Backup not found" };
    }
    // Real impl: also unlink the .tar.gz file from /volume1/backups/triton/.
    return { ok: true };
  }
}

// === Seed (UI demo records) ===

function makeSeed(): BackupRecord[] {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return [
    {
      id: "bak_seed_1",
      filename: `backup_${timestampLabel(oneDayAgo)}.tar.gz`,
      size: 2_847_104, // ~2.7 MB
      createdAt: oneDayAgo.toISOString(),
      contents: DEFAULT_CONTENTS,
    },
    {
      id: "bak_seed_2",
      filename: `backup_${timestampLabel(oneWeekAgo)}.tar.gz`,
      size: 2_134_528,
      createdAt: oneWeekAgo.toISOString(),
      contents: DEFAULT_CONTENTS,
    },
  ];
}

let cached: BackupService | null = null;

export function getBackupService(): BackupService {
  if (!cached) cached = new InMemoryBackupService(makeSeed());
  return cached;
}
