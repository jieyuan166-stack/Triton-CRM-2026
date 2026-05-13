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
const MANUAL_DATABASE_RE = /^backup_\d{8}T\d{6}\.db\.gz$/;
const DATABASE_RE = /^triton-\d{8}-\d{6}\.db\.gz$/;
const BACKUP_TIME_ZONE = "America/Vancouver";

export function getBackupDir() {
  return process.env.BACKUP_DIR || path.join(process.cwd(), "backups");
}

export function isSafeBackupFilename(filename: string) {
  return SNAPSHOT_RE.test(filename) || MANUAL_DATABASE_RE.test(filename) || DATABASE_RE.test(filename);
}

export function timestampLabel(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BACKUP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});

  return `${parts.year}${parts.month}${parts.day}T${parts.hour}${parts.minute}${parts.second}`;
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
  if (filename.startsWith("triton-")) return "database";
  return "snapshot";
}

function createdAtFromFilename(filename: string, fallback: Date) {
  const toVancouverIso = (
    y: string,
    m: string,
    d: string,
    h: string,
    min: string,
    s: string
  ) => {
    const utcGuess = Date.UTC(Number(y), Number(m) - 1, Number(d), Number(h), Number(min), Number(s));
    const offsetName = new Intl.DateTimeFormat("en-US", {
      timeZone: BACKUP_TIME_ZONE,
      timeZoneName: "shortOffset",
    })
      .formatToParts(new Date(utcGuess))
      .find((part) => part.type === "timeZoneName")?.value;
    const offsetMatch = offsetName?.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    const offsetMinutes = offsetMatch
      ? (offsetMatch[1] === "-" ? -1 : 1) *
        (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3] ?? "0"))
      : 0;
    return new Date(utcGuess - offsetMinutes * 60 * 1000).toISOString();
  };

  const snapshot = filename.match(/^backup_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.json\.gz$/);
  if (snapshot) {
    return toVancouverIso(snapshot[1], snapshot[2], snapshot[3], snapshot[4], snapshot[5], snapshot[6]);
  }
  const database = filename.match(/^triton-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.db\.gz$/);
  if (database) {
    return toVancouverIso(database[1], database[2], database[3], database[4], database[5], database[6]);
  }
  const manualDatabase = filename.match(/^backup_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.db\.gz$/);
  if (manualDatabase) {
    return toVancouverIso(manualDatabase[1], manualDatabase[2], manualDatabase[3], manualDatabase[4], manualDatabase[5], manualDatabase[6]);
  }
  return fallback.toISOString();
}

function sqliteDatabasePath() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("file:")) {
    throw new Error("DATABASE_URL must be a file: SQLite URL for file backups");
  }
  const raw = url.slice("file:".length);
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
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
        const isDb = entry.name.endsWith(".db.gz");
        return {
          id: entry.name,
          filename: entry.name,
          kind,
          restorable: !isDb && kind === "snapshot",
          size: stat.size,
          createdAt: createdAtFromFilename(entry.name, stat.mtime),
          contents:
            isDb ? ["SQLite Database"] : ["Clients", "Policies", "Follow Ups"],
        } satisfies BackupRecord;
      }),
  );

  return records.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function createSnapshotBackup(snapshot: BackupSnapshot) {
  // Production backups are real SQLite file backups. The legacy snapshot
  // argument is accepted so the existing SettingsProvider API does not need
  // to change; the actual source of truth is DATABASE_URL.
  void snapshot;
  await ensureBackupDir();
  const filename = `backup_${timestampLabel()}.db.gz`;
  const dbPath = sqliteDatabasePath();
  const body = await fs.readFile(dbPath);
  const compressed = await gzipAsync(body, { level: 9 });
  const file = backupPath(filename);
  await fs.writeFile(file, compressed, { mode: 0o600 });
  const stat = await fs.stat(file);
  return {
    id: filename,
    filename,
    kind: "snapshot",
    restorable: false,
    size: stat.size,
    createdAt: createdAtFromFilename(filename, stat.mtime),
    contents: ["SQLite Database"],
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
