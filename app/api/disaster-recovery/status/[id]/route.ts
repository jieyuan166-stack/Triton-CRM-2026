import { NextResponse } from "next/server";
import { requireSession, unauthorized } from "@/lib/api-security";
import { readDisasterRecoveryStatus } from "@/lib/disaster-recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!session) return unauthorized();
  if (session.user.role !== "admin") return NextResponse.json({ ok: false, error: "Admin access required" }, { status: 403 });
  try {
    const { id } = await params;
    return NextResponse.json({ ok: true, status: await readDisasterRecoveryStatus(id) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Status unavailable" }, { status: 400 });
  }
}
