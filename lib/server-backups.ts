import "server-only";

import { promises as fs } from "fs";
import path from "path";
import { gzip, gunzip } from "zlib";
import { promisify } from "util";

import type { BackupRecord, BackupSnapshot } from "@/lib/settings-types";
import { isValidSnapshot } from "@/lib/backup-service";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const SNAPSHOT_RE = /^backup_\d{8}T\d{6}\.json\.gz$/;
const DATABASE_RE = /^triton-\d{8}-\d{6}\.db\.gz$/;

export function getBackupDir() {
  return process.env.BACKUP_DIR || path.join(process.cwd(), "backups");
}

export function isSafeBackupFilename(filename: string) {
  return SNAPSHOT_RE.test(filename) || DATABASE_RE.test(filename);
}

export function timestampLabel(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function backupPath(filename: string) {
  if (!isSafeBackupFilename(filename)) {
    throw new Error("Invalid backup filename");
  }
  return path.join(getBackupDir(), filename);
}

async function ensureBackupDir() {
  await fs.mkdir(getBackupDir(), { recursive: true });
}

function kindFor(filename: string): BackupRecord["kind"] {
  return filename.endsWith(".json.gz") ? "snapshot" : "database";
}

function createdAtFromFilename(filename: string, fallback: Date) {
  const snapshot = filename.match(/^backup_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.json\.gz$/);
  if (snapshot) {
    return new Date(`${snapshot[1]}-${snapshot[2]}-${snapshot[3]}T${snapshot[4]}:${snapshot[5]}:${snapshot[6]}`).toISOString();
  }
  const database = filename.match(/^triton-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.db\.gz$/);
  if (database) {
    return new Date(`${database[1]}-${database[2]}-${database[3]}T${database[4]}:${database[5]}:${database[6]}`).toISOString();
  }
  return fallback.toISOString();
}

export async function listBackupFiles(): Promise<BackupRecord[]> {
  await ensureBackupDir();
  const entries = await fs.readdir(getBackupDir(), { withFileTypes: true });
  const records = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && isSafeBackupFilename(entry.name))
      .map(async (entry) => {
        const file = backupPath(entry.name);
        const stat = await fs.stat(file);
        const kind = kindFor(entry.name);
        return {
          id: entry.name,
          filename: entry.name,
          kind,
          restorable: kind === "snapshot",
          size: stat.size,
          createdAt: createdAtFromFilename(entry.name, stat.mtime),
          contents:
            kind === "snapshot"
              ? ["Clients", "Policies", "Follow Ups"]
              : ["SQLite Database"],
        } satisfies BackupRecord;
      }),
  );

  return records.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function createSnapshotBackup(snapshot: BackupSnapshot) {
  if (!isValidSnapshot(snapshot)) {
    throw new Error("Invalid backup snapshot");
  }
  await ensureBackupDir();
  const filename = `backup_${timestampLabel()}.json.gz`;
  const body = Buffer.from(JSON.stringify(snapshot, null, 2), "utf8");
  const compressed = await gzipAsync(body, { level: 9 });
  const file = backupPath(filename);
  await fs.writeFile(file, compressed, { mode: 0o600 });
  const stat = await fs.stat(file);
  return {
    id: filename,
    filename,
    kind: "snapshot",
    restorable: true,
    size: stat.size,
    createdAt: createdAtFromFilename(filename, stat.mtime),
    contents: ["Clients", "Policies", "Follow Ups"],
    data: snapshot,
  } satisfies BackupRecord;
}

export async function readSnapshotBackup(filename: string): Promise<BackupSnapshot> {
  if (!filename.endsWith(".json.gz")) {
    throw new Error("Only JSON snapshot backups can be restored from Settings");
  }
  const compressed = await fs.readFile(backupPath(filename));
  const raw = await gunzipAsync(compressed);
  const parsed = JSON.parse(raw.toString("utf8"));
  if (!isValidSnapshot(parsed)) {
    throw new Error("Backup file is missing required snapshot fields");
  }
  return parsed;
}

export async function deleteBackupFile(filename: string) {
  await fs.unlink(backupPath(filename));
}

export async function readBackupFile(filename: string) {
  const file = backupPath(filename);
  const stat = await fs.stat(file);
  const data = await fs.readFile(file);
  return { data, size: stat.size };
}
