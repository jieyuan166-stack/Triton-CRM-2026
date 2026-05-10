import { NextResponse } from "next/server";

import { auditLog, requireSession, unauthorized } from "@/lib/api-security";
import { readBackupFile } from "@/lib/server-backups";

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
    const { data } = await readBackupFile(id);
    await auditLog({ action: "download_backup", entityType: "backup", entityId: id });
    return new NextResponse(data, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${id}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Backup not found" },
      { status: 404 },
    );
  }
}
