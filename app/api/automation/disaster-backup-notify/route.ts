import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { sendDisasterRecoveryNotification } from "@/lib/disaster-recovery-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("test") }).strict(),
  z.object({ mode: z.literal("backup"), filename: z.string().min(1), downloadUrl: z.string().url().optional() }).strict(),
]);

export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid backup notification payload" }, { status: 400 });
  try {
    const result = await sendDisasterRecoveryNotification(parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[disaster-recovery] notification failed", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Backup notification failed" }, { status: 503 });
  }
}
