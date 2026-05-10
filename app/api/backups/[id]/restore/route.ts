import { NextResponse } from "next/server";

import { auditLog, requireSession, unauthorized } from "@/lib/api-security";
import { readSnapshotBackup } from "@/lib/server-backups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const { id } = await params;
  try {
    const data = await readSnapshotBackup(id);
    await auditLog({ action: "restore_backup", entityType: "backup", entityId: id });
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Restore failed" },
      { status: 400 },
    );
  }
}
