// lib/backup-service.ts
// Backup service abstraction. In production this talks to Next.js route
// handlers that write real files to BACKUP_DIR (/app/backups in Docker,
// mounted to /volume1/backups/triton on the NAS).

import type { BackupRecord, BackupSnapshot } from "./settings-types";

export interface BackupService {
  list(): Promise<BackupRecord[]>;
  createNow(snapshot: BackupSnapshot): Promise<BackupRecord>;
  restore(
    id: string
  ): Promise<{ ok: true; data: BackupSnapshot } | { ok: false; error: string }>;
  delete(id: string): Promise<{ ok: boolean; error?: string }>;
  importFromJson(
    text: string,
    filename: string
  ): Promise<{ ok: true; record: BackupRecord } | { ok: false; error: string }>;
}

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

async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) {
    const error = (json as { error?: string }).error || `Request failed (${response.status})`;
    throw new Error(error);
  }
  return json;
}

class ApiBackupService implements BackupService {
  async list(): Promise<BackupRecord[]> {
    const json = await readJson<{ backups: BackupRecord[] }>(await fetch("/api/backups", { cache: "no-store" }));
    return json.backups;
  }

  async createNow(snapshot: BackupSnapshot): Promise<BackupRecord> {
    const json = await readJson<{ ok: true; record: BackupRecord }>(
      await fetch("/api/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      }),
    );
    return json.record;
  }

  async restore(id: string) {
    try {
      const json = await readJson<{ ok: true; data: BackupSnapshot }>(
        await fetch(`/api/backups/${encodeURIComponent(id)}/restore`, { cache: "no-store" }),
      );
      return { ok: true as const, data: json.data };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Restore failed" };
    }
  }

  async delete(id: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await readJson<{ ok: true }>(
        await fetch(`/api/backups/${encodeURIComponent(id)}`, { method: "DELETE" }),
      );
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Delete failed" };
    }
  }

  async importFromJson(text: string, filename: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      return { ok: false as const, error: `Invalid JSON: ${(error as Error).message}` };
    }
    if (!isValidSnapshot(parsed)) {
      return {
        ok: false as const,
        error: "Backup file is missing required fields (version, clients, policies, followUps).",
      };
    }
    try {
      const record = await this.createNow(parsed);
      return {
        ok: true as const,
        record: {
          ...record,
          filename: filename.endsWith(".json") ? record.filename : record.filename,
        },
      };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Import failed" };
    }
  }
}

let cached: BackupService | null = null;

export function getBackupService(): BackupService {
  if (!cached) cached = new ApiBackupService();
  return cached;
}
