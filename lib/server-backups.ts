import "server-only";

import { execFile } from "child_process";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { gzip, gunzip } from "zlib";
import { promisify } from "util";

import type { BackupRecord, BackupSnapshot } from "@/lib/settings-types";
import {
  CURRENT_SNAPSHOT_SCHEMA_VERSION,
  describeSnapshotIncompatibility,
  isValidSnapshot,
} from "@/lib/backup-service";
import { db } from "@/lib/db";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const execFileAsync = promisify(execFile);

const SAFE_BACKUP_BASENAME_RE = /^[^\\/]+$/;
const SNAPSHOT_RE = /^backup_\d{8}T\d{6}\.json\.gz$/;
const USER_SNAPSHOT_RE = /^user_(.+)_(\d{8}T\d{6})(?:-[a-z0-9]+)?\.json\.gz$/;
const FRIENDLY_USER_SNAPSHOT_RE = /^advisor-([a-z0-9-]+)-(\d{8})-(\d{6})(?:-[a-z0-9]+)?\.json\.gz$/;
const MANUAL_DATABASE_RE = /^backup_\d{8}T\d{6}\.db\.gz$/;
const DATABASE_RE = /^triton-\d{8}-\d{6}(?:-[a-z0-9-]+)?\.db\.gz$/i;
const BACKUP_TIME_ZONE = "America/Vancouver";
const BACKUP_FLAGS_FILENAME = ".backup-flags.json";
const BACKUP_OWNERS_FILENAME = ".backup-owners.json";
type BackupFlags = Record<string, { important?: boolean }>;
type BackupOwners = Record<string, { ownerUserId: string; ownerEmail?: string; ownerName?: string }>;
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
      FRIENDLY_USER_SNAPSHOT_RE.test(filename) ||
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

function ownersPath() {
  return path.join(getBackupDir(), BACKUP_OWNERS_FILENAME);
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

async function readBackupOwners(): Promise<BackupOwners> {
  await ensureBackupDir();
  try {
    const raw = await fs.readFile(ownersPath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as BackupOwners;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    console.warn("[backups] could not read backup owners:", error);
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

async function writeBackupOwners(owners: BackupOwners) {
  await ensureBackupDir();
  const target = ownersPath();
  const temp = path.join(getBackupDir(), `.${BACKUP_OWNERS_FILENAME}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(temp, `${JSON.stringify(owners, null, 2)}\n`, {
    mode: 0o660,
  });
  await fs.rename(temp, target);
  await fs.chmod(target, 0o660).catch(() => undefined);
}

function slugForFilename(value: string) {
  return value
    .toLowerCase()
    .replace(/@/g, "-at-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "advisor";
}

function ownerIdFromFilename(filename: string) {
  return filename.match(USER_SNAPSHOT_RE)?.[1];
}

async function ownerMetadataForFilename(filename: string) {
  const legacyOwnerId = ownerIdFromFilename(filename);
  if (legacyOwnerId) return { ownerUserId: legacyOwnerId };
  const owners = await readBackupOwners();
  return owners[filename];
}

async function pruneUserSnapshotBackups(ownerUserId: string, keep = 10) {
  const entries = await fs.readdir(getBackupDir(), { withFileTypes: true });
  const flags = await readBackupFlags();
  const candidates = (
    await Promise.all(
      entries.map(async (entry) => {
        if (!entry.isFile() || !isSafeBackupFilename(entry.name) || kindFor(entry.name) !== "user-snapshot") {
          return null;
        }
        const owner = await ownerMetadataForFilename(entry.name);
        if (owner?.ownerUserId !== ownerUserId) return null;
        const stat = await fs.stat(backupPath(entry.name));
        return { filename: entry.name, mtimeMs: stat.mtimeMs };
      })
    )
  )
    .filter((item): item is { filename: string; mtimeMs: number } => !!item)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  let keptUnstarred = 0;
  for (const item of candidates) {
    if (flags[item.filename]?.important) continue;
    keptUnstarred += 1;
    if (keptUnstarred > keep) {
      await fs.unlink(backupPath(item.filename)).catch(() => undefined);
      await fs.unlink(backupChecksumPath(item.filename)).catch(() => undefined);
    }
  }
}

async function canAccessBackup(filename: string, user: BackupAccessUser) {
  if (user.role === "admin") return true;
  if (isDatabaseBackup(filename)) return false;
  const ownerId = (await ownerMetadataForFilename(filename))?.ownerUserId;
  if (ownerId) return ownerId === user.id;
  // Legacy JSON snapshots predate owner metadata and are treated as admin-only.
  return false;
}

async function assertBackupAccess(filename: string, user: BackupAccessUser) {
  if (!(await canAccessBackup(filename, user))) {
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
  if (filename.startsWith("user_") || filename.startsWith("advisor-")) return "user-snapshot";
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
  const friendlyUserSnapshot = filename.match(FRIENDLY_USER_SNAPSHOT_RE);
  if (friendlyUserSnapshot) {
    return toVancouverIso(
      friendlyUserSnapshot[2].slice(0, 4),
      friendlyUserSnapshot[2].slice(4, 6),
      friendlyUserSnapshot[2].slice(6, 8),
      friendlyUserSnapshot[3].slice(0, 2),
      friendlyUserSnapshot[3].slice(2, 4),
      friendlyUserSnapshot[3].slice(4, 6)
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
  const owners = await readBackupOwners();
  const users = await db.user.findMany({ select: { id: true, email: true, name: true } }).catch(() => []);
  const usersById = new Map(users.map((item) => [item.id, item]));
  const liveFilenames = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
  const cleanedFlags = Object.fromEntries(
    Object.entries(flags).filter(([filename]) => liveFilenames.has(filename))
  );
  if (Object.keys(cleanedFlags).length !== Object.keys(flags).length) {
    await writeBackupFlags(cleanedFlags);
  }
  const cleanedOwners = Object.fromEntries(
    Object.entries(owners).filter(([filename]) => liveFilenames.has(filename))
  );
  if (Object.keys(cleanedOwners).length !== Object.keys(owners).length) {
    await writeBackupOwners(cleanedOwners);
  }
  const records: Array<BackupRecord | null> = await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isFile() || !isSafeBackupFilename(entry.name)) return null;
      if (!(await canAccessBackup(entry.name, user))) return null;
      const file = backupPath(entry.name);
      const stat = await fs.stat(file);
      const kind = kindFor(entry.name);
      const isDb = entry.name.endsWith(".db.gz");
      const ownerMeta = await ownerMetadataForFilename(entry.name);
      const ownerUserId = ownerMeta?.ownerUserId;
      const owner = ownerUserId ? usersById.get(ownerUserId) : undefined;
      return {
        id: entry.name,
        filename: entry.name,
        kind,
        scope: isDb ? "database" : "user",
        ownerUserId,
        ownerEmail: owner?.email ?? ownerMeta?.ownerEmail,
        ownerName: owner?.name ?? ownerMeta?.ownerName,
        restorable: isDb || kind === "snapshot" || kind === "user-snapshot",
        important: !!cleanedFlags[entry.name]?.important,
        size: stat.size,
        createdAt: createdAtFromFilename(entry.name, stat.mtime),
        contents:
          isDb ? ["SQLite Database"] : ["Clients", "Policies", "Follow Ups", "Settings"],
      } satisfies BackupRecord;
    }),
  );

  return records
    .filter((record): record is BackupRecord => !!record)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function createSnapshotBackup(snapshot: BackupSnapshot, user: BackupAccessUser) {
  await ensureBackupDir();
  const ownerUserId = user.id;
  const ownerSlug = slugForFilename(user.name || user.email || "advisor");
  const filename = `advisor-${ownerSlug}-${timestampLabel().replace("T", "-")}.json.gz`;
  const body = Buffer.from(JSON.stringify({
    ...snapshot,
    version: CURRENT_SNAPSHOT_SCHEMA_VERSION,
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
  const owners = await readBackupOwners();
  owners[filename] = {
    ownerUserId,
    ownerEmail: user.email ?? undefined,
    ownerName: user.name ?? undefined,
  };
  await writeBackupOwners(owners);
  const stat = await fs.stat(file);
  await pruneUserSnapshotBackups(ownerUserId).catch((error) => {
    console.warn("[backups] user snapshot cleanup failed", { ownerUserId, error });
  });
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
  const tempPath = path.join("/tmp", `triton-online-backup-${process.pid}-${Date.now()}.db`);
  let body: Buffer;
  try {
    await execFileAsync("sqlite3", [dbPath, `.backup ${tempPath}`]);
    body = await fs.readFile(tempPath);
  } catch (error) {
    console.warn("[backups] sqlite online backup failed; falling back to direct DB read", error);
    body = await fs.readFile(dbPath).catch((readError) => {
      throw safeBackupReadError(readError);
    });
  } finally {
    await fs.unlink(tempPath).catch(() => undefined);
  }
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
  const incompatibility = describeSnapshotIncompatibility(parsed);
  if (incompatibility) {
    throw new Error(incompatibility);
  }
  if (!isValidSnapshot(parsed)) {
    // Defense-in-depth: describeSnapshotIncompatibility should have caught
    // every failure mode above, but we keep the type guard so callers can
    // rely on a typed return value.
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
  const owners = await readBackupOwners();
  if (owners[filename]) {
    delete owners[filename];
    await writeBackupOwners(owners);
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
