import { NextResponse } from "next/server";

import { auditLog, requireSession, unauthorized } from "@/lib/api-security";
import { deleteBackupFile } from "@/lib/server-backups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const { id } = await params;
  try {
    await deleteBackupFile(id);
    await auditLog({ action: "delete_backup", entityType: "backup", entityId: id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Delete failed" },
      { status: 404 },
    );
  }
}
