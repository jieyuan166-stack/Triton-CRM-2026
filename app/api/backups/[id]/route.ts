import { NextResponse } from "next/server";

import { auditLog, requireSession, unauthorized } from "@/lib/api-security";
import { deleteBackupFile, setBackupImportant } from "@/lib/server-backups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const { id } = await params;
  let body: { important?: boolean };
  try {
    body = (await request.json()) as { important?: boolean };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (typeof body.important !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "Invalid backup flag payload" },
      { status: 400 },
    );
  }

  try {
    await setBackupImportant(id, body.important, session.user);
    await auditLog({
      action: body.important ? "mark_backup_important" : "unmark_backup_important",
      entityType: "backup",
      entityId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[backups] important flag update failed", {
      id,
      important: body.important,
      error,
    });
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Backup flag update failed",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const { id } = await params;
  try {
    await deleteBackupFile(id, session.user);
    await auditLog({ action: "delete_backup", entityType: "backup", entityId: id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Delete failed" },
      { status: 404 },
    );
  }
}
