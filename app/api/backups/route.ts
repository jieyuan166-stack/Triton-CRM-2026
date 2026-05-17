import { NextResponse } from "next/server";

import { auditLog, requireSession, unauthorized } from "@/lib/api-security";
import { createSnapshotBackup, listBackupFiles, setBackupImportant } from "@/lib/server-backups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();

  const backups = await listBackupFiles();
  await auditLog({ action: "list_backups", entityType: "backup" });
  return NextResponse.json({ backups });
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  let snapshot: unknown;
  try {
    snapshot = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const record = await createSnapshotBackup(snapshot as never);
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
    await setBackupImportant(body.id, body.important);
    await auditLog({
      action: body.important ? "mark_backup_important" : "unmark_backup_important",
      entityType: "backup",
      entityId: body.id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Backup flag update failed" },
      { status: 400 },
    );
  }
}
