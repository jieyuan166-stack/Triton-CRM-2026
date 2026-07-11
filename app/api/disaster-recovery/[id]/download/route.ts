import { NextResponse } from "next/server";
import { auditLog, requireSession, unauthorized } from "@/lib/api-security";
import { readEncryptedDisasterRecoveryBackup } from "@/lib/disaster-recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!session) return unauthorized();
  if (session.user.role !== "admin") return NextResponse.json({ ok: false, error: "Admin access required" }, { status: 403 });
  try {
    const { id } = await params;
    const data = await readEncryptedDisasterRecoveryBackup(id);
    await auditLog({ action: "download_disaster_recovery_backup", entityType: "disaster_recovery", entityId: id });
    return new NextResponse(data, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${id}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Backup not found" }, { status: 404 });
  }
}
