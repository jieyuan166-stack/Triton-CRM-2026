import { NextResponse } from "next/server";

import { auditLog, requireSession, unauthorized } from "@/lib/api-security";
import { db } from "@/lib/db";
import { createDatabaseBackup, createSnapshotBackup, listBackupFiles, setBackupImportant } from "@/lib/server-backups";
import type { BackupSnapshot } from "@/lib/settings-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();

  const backups = await listBackupFiles(session.user);
  await auditLog({ action: "list_backups", entityType: "backup" });
  return NextResponse.json({ backups });
}

export async function POST() {
  const session = await requireSession();
  if (!session) return unauthorized();

  try {
    const record =
      session.user.role === "admin"
        ? await createDatabaseBackup("manual")
        : await createSnapshotBackup(await buildUserSnapshot(session.user.id), session.user);
    await auditLog({
      action: "create_backup",
      entityType: "backup",
      entityId: record.filename,
      metadata: { filename: record.filename, size: record.size, kind: record.kind },
    });
    return NextResponse.json({ ok: true, record }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Backup failed" },
      { status: 400 },
    );
  }
}

async function buildUserSnapshot(userId: string): Promise<BackupSnapshot> {
  const [clients, policies, followUps, relationships, emailReminderSends, settings] =
    await Promise.all([
      db.client.findMany({
        where: { userId },
        include: { emailHistory: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      }),
      db.policy.findMany({
        where: { userId },
        include: { beneficiaries: true },
        orderBy: [{ carrier: "asc" }, { policyNumber: "asc" }],
      }),
      db.followUp.findMany({
        where: { client: { userId } },
        orderBy: { date: "asc" },
      }),
      db.clientRelationship.findMany({
        where: {
          fromClient: { userId },
          toClient: { userId },
        },
        orderBy: { createdAt: "asc" },
      }),
      db.emailReminderSend.findMany({
        where: { client: { userId } },
        orderBy: { sentAt: "asc" },
      }),
      db.settings.findUnique({ where: { userId } }),
    ]);

  return {
    version: 1,
    scope: "user",
    ownerUserId: userId,
    capturedAt: new Date().toISOString(),
    clients,
    policies,
    followUps,
    relationships,
    emailReminderSends,
    settings: settings ? JSON.parse(settings.data) : undefined,
  };
}

export async function PATCH(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  let body: { id?: string; important?: boolean };
  try {
    body = (await request.json()) as { id?: string; important?: boolean };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.id || typeof body.important !== "boolean") {
    return NextResponse.json({ ok: false, error: "Invalid backup flag payload" }, { status: 400 });
  }

  try {
    await setBackupImportant(body.id, body.important, session.user);
    await auditLog({
      action: body.important ? "mark_backup_important" : "unmark_backup_important",
      entityType: "backup",
      entityId: body.id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[backups] flag update failed", {
      id: body.id,
      important: body.important,
      error,
    });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Backup flag update failed" },
      { status: 400 },
    );
  }
}
