import { NextResponse } from "next/server";

import { auditLog, requireSession, unauthorized } from "@/lib/api-security";
import { readSnapshotBackup, restoreDatabaseBackup } from "@/lib/server-backups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const { id } = await params;
  try {
    if (!id.toLowerCase().endsWith(".json.gz")) {
      const result = await restoreDatabaseBackup(id, session.user);
      await auditLog({
        action: "restore_backup",
        entityType: "backup",
        entityId: id,
        metadata: { kind: "database" },
      }).catch((auditError) => {
        console.warn("[backup restore] audit log failed after database restore:", auditError);
      });
      setTimeout(() => process.exit(0), 5000).unref();
      return NextResponse.json({ ok: true, ...result });
    }

    const ownerMatch = id.match(/^user_(.+)_\d{8}T\d{6}(?:-[a-z0-9]+)?\.json\.gz$/);
    if (ownerMatch && ownerMatch[1] !== session.user.id) {
      return NextResponse.json(
        { ok: false, error: "Only the snapshot owner can restore this backup" },
        { status: 403 },
      );
    }

    const data = await readSnapshotBackup(id, session.user);
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
export function GET() {
  return NextResponse.json(
    { ok: false, error: "Use POST to restore backups" },
    { status: 405, headers: { Allow: "POST" } },
  );
}
