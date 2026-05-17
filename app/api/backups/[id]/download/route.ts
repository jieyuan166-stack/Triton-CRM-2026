import { NextResponse } from "next/server";

import { auditLog, requireSession, unauthorized } from "@/lib/api-security";
import { BackupAccessError, readBackupFile } from "@/lib/server-backups";

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
    const { data } = await readBackupFile(id, session.user);
    await auditLog({ action: "download_backup", entityType: "backup", entityId: id });
    return new NextResponse(data, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${id}"`,
      },
    });
  } catch (error) {
    console.error("[backups] download failed", {
      id,
      userId: session.user.id,
      role: session.user.role,
      error,
    });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Backup not found" },
      { status: error instanceof BackupAccessError ? 403 : 404 },
    );
  }
}
