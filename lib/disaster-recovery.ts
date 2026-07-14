import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

const backupFilenameSchema = z.string().regex(/^triton-crm-backup-\d{4}-\d{2}-\d{2}-\d{6}-(?:manual|scheduled|pre-deploy|pre-migration|pre-restore)\.tar\.gz\.age$/);

const countsSchema = z.record(z.string(), z.number()).default({});
const metadataSchema = z.object({
  formatVersion: z.literal(1),
  filename: backupFilenameSchema,
  createdAt: z.string().datetime({ offset: true }),
  reason: z.enum(["manual", "scheduled", "pre-deploy", "pre-migration", "pre-restore"]),
  classes: z.array(z.string()),
  important: z.boolean().default(false),
  encrypted: z.literal(true),
  sizeBytes: z.number().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  verifiedAt: z.string().datetime({ offset: true }),
  remote: z.object({ uploaded: z.boolean(), key: z.string(), uploadedAt: z.string().datetime({ offset: true }).nullable().optional() }),
  email: z.object({ sent: z.boolean(), sentAt: z.string().datetime({ offset: true }).nullable().optional(), downloadUrl: z.string() }),
  counts: countsSchema,
  uploads: z.object({ count: z.number().nonnegative(), bytes: z.number().nonnegative() }).default({ count: 0, bytes: 0 }),
  validation: z.record(z.string(), z.unknown()).default({}),
  application: z.record(z.string(), z.unknown()).default({}),
});

export type DisasterRecoveryBackup = z.infer<typeof metadataSchema>;
export type DisasterRecoveryRequestAction = "backup" | "restore" | "test-email";

const root = process.env.DISASTER_RECOVERY_ROOT || path.join(process.cwd(), "disaster-recovery");
export const disasterRecoveryPaths = {
  backups: process.env.DISASTER_RECOVERY_BACKUPS_DIR || path.join(root, "backups"),
  statuses: process.env.DISASTER_RECOVERY_STATUS_DIR || path.join(root, "status"),
  requests: process.env.DISASTER_RECOVERY_REQUESTS_DIR || path.join(root, "requests"),
};

function requestPayload(input: { id: string; action: DisasterRecoveryRequestAction; filename?: string; requestedAt: string; requestedById: string; confirmation?: string }) {
  return [input.id, input.action, input.filename ?? "", input.requestedAt, input.requestedById, input.confirmation ?? ""].join("|");
}

function controlSecret() {
  const secret = process.env.BACKUP_CONTROL_SECRET;
  if (!secret || secret.length < 32) throw new Error("Disaster recovery control secret is not configured");
  return secret;
}

export function assertDisasterRecoveryFilename(filename: string) {
  return backupFilenameSchema.parse(filename);
}

export async function listDisasterRecoveryBackups(): Promise<DisasterRecoveryBackup[]> {
  try {
    const entries = await fs.readdir(disasterRecoveryPaths.backups, { withFileTypes: true });
    const results = await Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith(".meta.json")).map(async (entry) => {
      try {
        const raw = await fs.readFile(path.join(disasterRecoveryPaths.backups, entry.name), "utf8");
        return metadataSchema.safeParse(JSON.parse(raw));
      } catch {
        return null;
      }
    }));
    return results
      .flatMap((result) => result && result.success ? [result.data] : [])
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function getDisasterRecoveryBackup(filename: string) {
  assertDisasterRecoveryFilename(filename);
  const record = (await listDisasterRecoveryBackups()).find((item) => item.filename === filename);
  if (!record) throw new Error("Disaster recovery backup was not found");
  return record;
}

export async function readEncryptedDisasterRecoveryBackup(filename: string) {
  await getDisasterRecoveryBackup(filename);
  const data = await fs.readFile(path.join(disasterRecoveryPaths.backups, filename));
  return data;
}

export async function enqueueDisasterRecoveryRequest(input: {
  action: DisasterRecoveryRequestAction;
  requestedById: string;
  requestedByEmail?: string | null;
  filename?: string;
  confirmation?: string;
}) {
  if (input.filename) assertDisasterRecoveryFilename(input.filename);
  if (input.action === "restore" && input.confirmation !== "RESTORE") {
    throw new Error("RESTORE confirmation is required");
  }
  const id = randomUUID();
  const requestedAt = new Date().toISOString();
  const payload = requestPayload({ id, action: input.action, filename: input.filename, requestedAt, requestedById: input.requestedById, confirmation: input.confirmation });
  const signature = createHmac("sha256", controlSecret()).update(payload).digest("hex");
  const request = {
    id,
    action: input.action,
    filename: input.filename,
    confirmation: input.confirmation,
    requestedAt,
    requestedBy: { id: input.requestedById, email: input.requestedByEmail ?? null },
    signature,
  };
  await fs.mkdir(disasterRecoveryPaths.requests, { recursive: true });
  const temp = path.join(disasterRecoveryPaths.requests, `.${id}.tmp`);
  const target = path.join(disasterRecoveryPaths.requests, `${id}.json`);
  // The queue directory is setgid to the NAS admin group. The CRM process
  // writes the signed request, while the host-side worker (a different UID in
  // the same private group) must read it after the atomic rename.
  await fs.writeFile(temp, `${JSON.stringify(request)}\n`, { mode: 0o640 });
  await fs.rename(temp, target);
  return { id, requestedAt };
}

export async function readDisasterRecoveryStatus(id: string) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error("Invalid disaster recovery request id");
  try {
    const raw = await fs.readFile(path.join(disasterRecoveryPaths.statuses, `${id}.json`), "utf8");
    return z.object({
      id: z.string().uuid(),
      state: z.enum(["queued", "running", "completed", "failed"]),
      message: z.string(),
      filename: z.string().nullable().optional(),
      updatedAt: z.string().datetime({ offset: true }),
    }).parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { id, state: "queued" as const, message: "Waiting for the NAS worker", updatedAt: new Date().toISOString() };
    throw error;
  }
}

export function verifyDisasterRecoveryRequestSignature(request: { id: string; action: DisasterRecoveryRequestAction; filename?: string; requestedAt: string; requestedBy: { id: string }; confirmation?: string; signature: string }) {
  const expected = createHmac("sha256", controlSecret()).update(requestPayload({
    id: request.id,
    action: request.action,
    filename: request.filename,
    requestedAt: request.requestedAt,
    requestedById: request.requestedBy.id,
    confirmation: request.confirmation,
  })).digest();
  const supplied = Buffer.from(request.signature, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
