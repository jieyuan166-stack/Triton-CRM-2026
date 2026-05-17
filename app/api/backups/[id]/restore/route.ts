import { NextResponse } from "next/server";

import { auditLog, requireSession, unauthorized } from "@/lib/api-security";
import { isDatabaseBackup, readSnapshotBackup, restoreDatabaseBackup } from "@/lib/server-backups";

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
    if (isDatabaseBackup(id)) {
      const result = await restoreDatabaseBackup(id);
      await auditLog({
        action: "restore_backup",
        entityType: "backup",
        entityId: id,
        metadata: { kind: "database", beforeRestore: result.beforeRestore.filename },
      }).catch((auditError) => {
        console.warn("[backup restore] audit log failed after database restore:", auditError);
      });
      setTimeout(() => process.exit(0), 5000).unref();
      return NextResponse.json({ ok: true, ...result });
    }

    const data = await readSnapshotBackup(id);
    await auditLog({ action: "restore_backup", entityType: "backup", entityId: id });
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error("[backup restore] failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Restore failed" },
      { status: 400 },
    );
  }
}
