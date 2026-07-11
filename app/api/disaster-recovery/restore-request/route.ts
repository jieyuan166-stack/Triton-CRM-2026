import { NextResponse } from "next/server";
import { z } from "zod";
import { auditLog, requireSession, unauthorized } from "@/lib/api-security";
import { enqueueDisasterRecoveryRequest } from "@/lib/disaster-recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({ filename: z.string().min(1), confirmation: z.literal("RESTORE") }).strict();

export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();
  if (session.user.role !== "admin") return NextResponse.json({ ok: false, error: "Admin access required" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Type RESTORE to confirm this operation" }, { status: 400 });
  try {
    const queued = await enqueueDisasterRecoveryRequest({
      action: "restore",
      filename: parsed.data.filename,
      confirmation: parsed.data.confirmation,
      requestedById: session.user.id,
      requestedByEmail: session.user.email,
    });
    await auditLog({ action: "queue_disaster_recovery_restore", entityType: "disaster_recovery", entityId: parsed.data.filename, metadata: { requestId: queued.id } });
    return NextResponse.json({ ok: true, request: queued }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not queue restore" }, { status: 400 });
  }
}
