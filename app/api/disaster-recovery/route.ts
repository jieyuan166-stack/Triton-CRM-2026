import { NextResponse } from "next/server";
import { z } from "zod";
import { auditLog, requireSession, unauthorized } from "@/lib/api-security";
import { enqueueDisasterRecoveryRequest, listDisasterRecoveryBackups } from "@/lib/disaster-recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({ action: z.enum(["backup", "test-email"]) }).strict();

function requireAdmin(session: Awaited<ReturnType<typeof requireSession>>) {
  return !!session && session.user.role === "admin";
}

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();
  if (!requireAdmin(session)) return NextResponse.json({ ok: false, error: "Admin access required" }, { status: 403 });
  const backups = await listDisasterRecoveryBackups();
  await auditLog({ action: "list_disaster_recovery_backups", entityType: "disaster_recovery" });
  return NextResponse.json({ ok: true, backups });
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();
  if (!requireAdmin(session)) return NextResponse.json({ ok: false, error: "Admin access required" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid disaster recovery request" }, { status: 400 });
  try {
    const queued = await enqueueDisasterRecoveryRequest({
      action: parsed.data.action,
      requestedById: session.user.id,
      requestedByEmail: session.user.email,
    });
    await auditLog({ action: `queue_disaster_recovery_${parsed.data.action}`, entityType: "disaster_recovery", entityId: queued.id });
    return NextResponse.json({ ok: true, request: queued }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not queue disaster recovery request" }, { status: 503 });
  }
}
