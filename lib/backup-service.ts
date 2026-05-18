// lib/backup-service.ts
// Backup service abstraction. In production this talks to Next.js route
// handlers that write real files to BACKUP_DIR (/app/backups in Docker,
// mounted to /volume1/docker/triton-crm/backups on the NAS).

import type { BackupRecord, BackupSnapshot } from "./settings-types";

export type RestoreBackupResult =
  | { ok: true; data: BackupSnapshot; restartRequired?: false }
  | { ok: true; restartRequired: true; beforeRestore?: BackupRecord }
  | { ok: false; error: string };

export interface BackupService {
  list(): Promise<BackupRecord[]>;
  createNow(snapshot: BackupSnapshot): Promise<BackupRecord>;
  restore(id: string): Promise<RestoreBackupResult>;
  delete(id: string): Promise<{ ok: boolean; error?: string }>;
  setImportant(id: string, important: boolean): Promise<{ ok: boolean; error?: string }>;
  importFromJson(
    text: string,
    filename: string
  ): Promise<{ ok: true; record: BackupRecord } | { ok: false; error: string }>;
}

export const CURRENT_SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const SUPPORTED_SNAPSHOT_SCHEMA_VERSIONS: readonly number[] = [1];

/**
 * Loose validator: a snapshot is restorable if it has the core arrays we
 * expect. Older snapshots may be missing optional fields (relationships,
 * emailReminderSends, settings) — those are tolerated. Newer schema
 * versions will fail here, surfacing a clear error before we try to
 * write half-understood data into the database.
 */
export function isValidSnapshot(v: unknown): v is BackupSnapshot {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (!SUPPORTED_SNAPSHOT_SCHEMA_VERSIONS.includes(o.version as number)) return false;
  return (
    typeof o.capturedAt === "string" &&
    Array.isArray(o.clients) &&
    Array.isArray(o.policies) &&
    Array.isArray(o.followUps)
  );
}

export function describeSnapshotIncompatibility(v: unknown): string | null {
  if (!v || typeof v !== "object") return "Backup file is empty or not a JSON object.";
  const o = v as Record<string, unknown>;
  if (typeof o.version !== "number") {
    return "Backup file is missing the schema version field.";
  }
  if (!SUPPORTED_SNAPSHOT_SCHEMA_VERSIONS.includes(o.version)) {
    return `Backup schema version ${o.version} is not supported by this server (supported: ${SUPPORTED_SNAPSHOT_SCHEMA_VERSIONS.join(", ")}).`;
  }
  if (typeof o.capturedAt !== "string") return "Backup is missing the capturedAt timestamp.";
  if (!Array.isArray(o.clients)) return "Backup is missing the clients array.";
  if (!Array.isArray(o.policies)) return "Backup is missing the policies array.";
  if (!Array.isArray(o.followUps)) return "Backup is missing the followUps array.";
  return null;
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
      const json = await readJson<
        | { ok: true; data: BackupSnapshot; restartRequired?: false }
        | { ok: true; restartRequired: true; beforeRestore?: BackupRecord }
      >(
        await fetch(`/api/backups/${encodeURIComponent(id)}/restore`, { method: "POST", cache: "no-store" }),
      );
      if ("restartRequired" in json && json.restartRequired) {
        return {
          ok: true as const,
          restartRequired: true as const,
          beforeRestore: json.beforeRestore,
        };
      }
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

  async setImportant(id: string, important: boolean): Promise<{ ok: boolean; error?: string }> {
    try {
      await readJson<{ ok: true }>(
        await fetch(`/api/backups/${encodeURIComponent(id)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ important }),
        }),
      );
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Update failed" };
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
