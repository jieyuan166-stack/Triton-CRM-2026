import "server-only";

import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { gzip, gunzip } from "zlib";
import { promisify } from "util";

import type { BackupRecord, BackupSnapshot } from "@/lib/settings-types";
import { isValidSnapshot } from "@/lib/backup-service";
import { db } from "@/lib/db";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const SAFE_BACKUP_BASENAME_RE = /^[^\\/]+$/;
const SNAPSHOT_RE = /^backup_\d{8}T\d{6}\.json\.gz$/;
const USER_SNAPSHOT_RE = /^user_(.+)_(\d{8}T\d{6})(?:-[a-z0-9]+)?\.json\.gz$/;
const MANUAL_DATABASE_RE = /^backup_\d{8}T\d{6}\.db\.gz$/;
const DATABASE_RE = /^triton-\d{8}-\d{6}(?:-[a-z0-9-]+)?\.db\.gz$/i;
const BACKUP_TIME_ZONE = "America/Vancouver";
const BACKUP_FLAGS_FILENAME = ".backup-flags.json";
type BackupFlags = Record<string, { important?: boolean }>;
type BackupAccessUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role?: string | null;
};

export class BackupAccessError extends Error {
  constructor(message = "This backup is not available for the current user. Refresh the backup list or switch to the backup owner account.") {
    super(message);
    this.name = "BackupAccessError";
  }
}

export function getBackupDir() {
  return process.env.BACKUP_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "backups");
}

export function isSafeBackupFilename(filename: string) {
  return (
    SAFE_BACKUP_BASENAME_RE.test(filename) &&
    path.basename(filename) === filename &&
    (SNAPSHOT_RE.test(filename) ||
      USER_SNAPSHOT_RE.test(filename) ||
      MANUAL_DATABASE_RE.test(filename) ||
      DATABASE_RE.test(filename))
  );
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

function backupChecksumPath(filename: string) {
  return `${backupPath(filename)}.sha256`;
}

function sha256Hex(data: Buffer) {
  return createHash("sha256").update(data).digest("hex");
}

async function writeBackupChecksum(filename: string, data: Buffer) {
  const checksumFile = backupChecksumPath(filename);
  await fs.writeFile(checksumFile, `${sha256Hex(data)}  ${filename}\n`, { mode: 0o660 });
  await fs.chmod(checksumFile, 0o660).catch(() => undefined);
}

async function verifyBackupChecksum(filename: string, data: Buffer) {
  const checksumFile = backupChecksumPath(filename);
  let expected: string | undefined;

  try {
    const raw = await fs.readFile(checksumFile, "utf8");
    expected = raw.trim().split(/\s+/)[0]?.toLowerCase();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.warn(`[backups] checksum sidecar missing for ${filename}; allowing legacy restore`);
      return;
    }
    throw safeBackupReadError(error);
  }

  if (!expected || !/^[a-f0-9]{64}$/.test(expected)) {
    throw new Error("Backup checksum file is invalid");
  }

  const actual = sha256Hex(data);
  if (actual !== expected) {
    throw new Error("Backup checksum verification failed");
  }
}

async function ensureBackupDir() {
  await fs.mkdir(getBackupDir(), { recursive: true });
}

function flagsPath() {
  return path.join(getBackupDir(), BACKUP_FLAGS_FILENAME);
}

async function readBackupFlags(): Promise<BackupFlags> {
  await ensureBackupDir();
  try {
    const raw = await fs.readFile(flagsPath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as BackupFlags;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    console.warn("[backups] could not read backup flags:", error);
    return {};
  }
}

async function writeBackupFlags(flags: BackupFlags) {
  await ensureBackupDir();
  const target = flagsPath();
  const temp = path.join(getBackupDir(), `.${BACKUP_FLAGS_FILENAME}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(temp, `${JSON.stringify(flags, null, 2)}\n`, {
    mode: 0o660,
  });
  await fs.rename(temp, target);
  await fs.chmod(target, 0o660).catch(() => undefined);
}

function safeUserIdForFilename(userId: string) {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function ownerIdFromFilename(filename: string) {
  return filename.match(USER_SNAPSHOT_RE)?.[1];
}

function canAccessBackup(filename: string, user: BackupAccessUser) {
  if (user.role === "admin") return true;
  if (isDatabaseBackup(filename)) return false;
  const ownerId = ownerIdFromFilename(filename);
  if (ownerId) return ownerId === user.id;
  // Legacy JSON snapshots predate owner metadata and are treated as admin-only.
  return false;
}

async function assertBackupAccess(filename: string, user: BackupAccessUser) {
  if (!canAccessBackup(filename, user)) {
    throw new BackupAccessError();
  }
}

export async function setBackupImportant(filename: string, important: boolean, user?: BackupAccessUser) {
  if (user) await assertBackupAccess(filename, user);
  const target = backupPath(filename);
  await fs.access(target).catch((error) => {
    throw safeBackupReadError(error);
  });
  const flags = await readBackupFlags();
  if (important) {
    flags[filename] = { ...(flags[filename] ?? {}), important: true };
  } else {
    if (flags[filename]) delete flags[filename].important;
    if (flags[filename] && Object.keys(flags[filename]).length === 0) {
      delete flags[filename];
    }
  }
  await writeBackupFlags(flags);
  return { ok: true as const };
}

function kindFor(filename: string): BackupRecord["kind"] {
  if (filename.startsWith("user_")) return "user-snapshot";
  if (filename.startsWith("triton-")) return "database";
  if (filename.endsWith(".db.gz")) return "database";
  return "snapshot";
}

export function isDatabaseBackup(filename: string) {
  return filename.endsWith(".db.gz");
}

function safeBackupReadError(error: unknown): Error {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EACCES") {
      return new Error("Backup file is not readable by the app. Please repair backup permissions.");
    }
    if (code === "ENOENT") {
      return new Error("Backup file no longer exists. Refresh the backup list.");
    }
  }
  return error instanceof Error ? error : new Error("Backup file could not be read");
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
  const userSnapshot = filename.match(USER_SNAPSHOT_RE);
  if (userSnapshot) {
    const compact = userSnapshot[2];
    return toVancouverIso(
      compact.slice(0, 4),
      compact.slice(4, 6),
      compact.slice(6, 8),
      compact.slice(9, 11),
      compact.slice(11, 13),
      compact.slice(13, 15)
    );
  }
  const database = filename.match(/^triton-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:-[a-z0-9-]+)?\.db\.gz$/i);
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
  return path.isAbsolute(raw) ? raw : path.resolve(/*turbopackIgnore: true*/ process.cwd(), raw);
}

export async function listBackupFiles(user: BackupAccessUser): Promise<BackupRecord[]> {
  await ensureBackupDir();
  const entries = await fs.readdir(getBackupDir(), { withFileTypes: true });
  const flags = await readBackupFlags();
  const users = await db.user.findMany({ select: { id: true, email: true, name: true } }).catch(() => []);
  const usersById = new Map(users.map((item) => [item.id, item]));
  const liveFilenames = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
  const cleanedFlags = Object.fromEntries(
    Object.entries(flags).filter(([filename]) => liveFilenames.has(filename))
  );
  if (Object.keys(cleanedFlags).length !== Object.keys(flags).length) {
    await writeBackupFlags(cleanedFlags);
  }
  const records = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && isSafeBackupFilename(entry.name) && canAccessBackup(entry.name, user))
      .map(async (entry) => {
        const file = backupPath(entry.name);
        const stat = await fs.stat(file);
        const kind = kindFor(entry.name);
        const isDb = entry.name.endsWith(".db.gz");
        const ownerUserId = ownerIdFromFilename(entry.name);
        const owner = ownerUserId ? usersById.get(ownerUserId) : undefined;
        return {
          id: entry.name,
          filename: entry.name,
          kind,
          scope: isDb ? "database" : "user",
          ownerUserId,
          ownerEmail: owner?.email,
          ownerName: owner?.name,
          restorable: isDb || kind === "snapshot" || kind === "user-snapshot",
          important: !!cleanedFlags[entry.name]?.important,
          size: stat.size,
          createdAt: createdAtFromFilename(entry.name, stat.mtime),
          contents:
            isDb ? ["SQLite Database"] : ["Clients", "Policies", "Follow Ups", "Settings"],
        } satisfies BackupRecord;
      }),
  );

  return records.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function createSnapshotBackup(snapshot: BackupSnapshot, user: BackupAccessUser) {
  await ensureBackupDir();
  const ownerUserId = user.id;
  const suffix = createHash("sha1").update(`${process.pid}:${Date.now()}:${Math.random()}`).digest("hex").slice(0, 6);
  const filename = `user_${safeUserIdForFilename(ownerUserId)}_${timestampLabel()}-${suffix}.json.gz`;
  const body = Buffer.from(JSON.stringify({
    ...snapshot,
    version: 1,
    scope: "user",
    ownerUserId,
    ownerEmail: user.email ?? "",
    ownerName: user.name ?? "",
    capturedAt: snapshot.capturedAt || new Date().toISOString(),
  }), "utf8");
  const compressed = await gzipAsync(body, { level: 9 });
  const file = backupPath(filename);
  await fs.writeFile(file, compressed, { mode: 0o660 });
  await writeBackupChecksum(filename, compressed);
  const stat = await fs.stat(file);
  return {
    id: filename,
    filename,
    kind: "user-snapshot",
    scope: "user",
    ownerUserId,
    ownerEmail: user.email ?? undefined,
    ownerName: user.name ?? undefined,
    restorable: true,
    size: stat.size,
    createdAt: createdAtFromFilename(filename, stat.mtime),
    contents: ["Clients", "Policies", "Follow Ups", "Settings"],
  } satisfies BackupRecord;
}

export async function createDatabaseBackup(label?: string) {
  await ensureBackupDir();
  const safeLabel = label
    ? `-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`
    : "";
  const filename = `triton-${timestampLabel().replace("T", "-")}${safeLabel}.db.gz`;
  const dbPath = sqliteDatabasePath();
  const body = await fs.readFile(dbPath).catch((error) => {
    throw safeBackupReadError(error);
  });
  const compressed = await gzipAsync(body, { level: 9 });
  const file = backupPath(filename);
  await fs.writeFile(file, compressed, { mode: 0o660 });
  await writeBackupChecksum(filename, compressed);
  const stat = await fs.stat(file);
  return {
    id: filename,
    filename,
    kind: "database",
    restorable: true,
    size: stat.size,
    createdAt: createdAtFromFilename(filename, stat.mtime),
    contents: ["SQLite Database"],
  } satisfies BackupRecord;
}

export async function readSnapshotBackup(filename: string, user: BackupAccessUser): Promise<BackupSnapshot> {
  await assertBackupAccess(filename, user);
  if (!filename.endsWith(".json.gz")) {
    throw new Error("Only JSON snapshot backups can be restored from Settings");
  }
  const compressed = await fs.readFile(backupPath(filename)).catch((error) => {
    throw safeBackupReadError(error);
  });
  const raw = await gunzipAsync(compressed);
  const parsed = JSON.parse(raw.toString("utf8"));
  if (!isValidSnapshot(parsed)) {
    throw new Error("Backup file is missing required snapshot fields");
  }
  return parsed;
}

function assertSqliteDatabase(data: Buffer) {
  if (data.length < 16 || data.subarray(0, 16).toString("binary") !== "SQLite format 3\u0000") {
    throw new Error("Backup is not a valid SQLite database");
  }
}

async function removeSqliteSidecars(dbPath: string) {
  await Promise.all([
    fs.unlink(`${dbPath}-wal`).catch(() => undefined),
    fs.unlink(`${dbPath}-shm`).catch(() => undefined),
  ]);
}

export async function restoreDatabaseBackup(filename: string, user?: BackupAccessUser) {
  if (user?.role !== "admin") {
    throw new Error("Only admins can restore database backups");
  }
  if (!isDatabaseBackup(filename)) {
    throw new Error("Only SQLite database backups can use database restore");
  }

  const compressed = await fs.readFile(backupPath(filename)).catch((error) => {
    throw safeBackupReadError(error);
  });
  await verifyBackupChecksum(filename, compressed);
  const restored = await gunzipAsync(compressed);
  assertSqliteDatabase(restored);

  const dbPath = sqliteDatabasePath();
  const tempPath = path.join(path.dirname(dbPath), `.triton-restore-${Date.now()}.db`);

  await fs.writeFile(tempPath, restored, { mode: 0o660 });
  await db.$disconnect().catch(() => undefined);
  await removeSqliteSidecars(dbPath);
  await fs.rename(tempPath, dbPath);
  await fs.chmod(dbPath, 0o660).catch(() => undefined);

  return { restartRequired: true as const };
}

export async function deleteBackupFile(filename: string, user?: BackupAccessUser) {
  if (user) await assertBackupAccess(filename, user);
  await fs.unlink(backupPath(filename));
  await fs.unlink(backupChecksumPath(filename)).catch(() => undefined);
  const flags = await readBackupFlags();
  if (flags[filename]) {
    delete flags[filename];
    await writeBackupFlags(flags);
  }
}

export async function readBackupFile(filename: string, user?: BackupAccessUser) {
  if (user) await assertBackupAccess(filename, user);
  const file = backupPath(filename);
  const stat = await fs.stat(file).catch((error) => {
    throw safeBackupReadError(error);
  });
  const data = await fs.readFile(file).catch((error) => {
    throw safeBackupReadError(error);
  });
  return { data, size: stat.size };
}
