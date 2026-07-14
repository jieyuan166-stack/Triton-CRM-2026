import { NextResponse } from "next/server";

import { auditLog, requireSession, unauthorized } from "@/lib/api-security";
import { BackupAccessError, createDatabaseBackup, createSnapshotBackup, deleteBackupFiles, listBackupFiles, setBackupImportant } from "@/lib/server-backups";
import { buildUserSnapshot } from "@/lib/user-backup-snapshots";

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
        : await createSnapshotBackup(await buildUserSnapshot(session.user.id), session.user, { source: "manual" });
    await auditLog({
      action: "create_backup",
      entityType: "backup",
      entityId: record.filename,
      metadata: { filename: record.filename, size: record.size, kind: record.kind },
    });
    return NextResponse.json({ ok: true, record }, { status: 201 });
  } catch (error) {
    console.error("[backups] create failed", {
      userId: session.user.id,
      role: session.user.role,
      error,
    });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Backup failed" },
      { status: 400 },
    );
  }
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

export async function DELETE(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const body = await request.json().catch(() => null) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) && body.ids.every((id) => typeof id === "string")
    ? [...new Set(body.ids)]
    : [];
  if (ids.length === 0 || ids.length > 100) {
    return NextResponse.json({ ok: false, error: "Select between 1 and 100 backups to delete" }, { status: 400 });
  }

  try {
    await deleteBackupFiles(ids, session.user);
    await auditLog({ action: "delete_backups", entityType: "backup", metadata: { count: ids.length } });
    return NextResponse.json({ ok: true, deleted: ids.length });
  } catch (error) {
    console.error("[backups] batch delete failed", { count: ids.length, userId: session.user.id, role: session.user.role, error });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Delete failed" },
      { status: error instanceof BackupAccessError ? 403 : 404 },
    );
  }
}
