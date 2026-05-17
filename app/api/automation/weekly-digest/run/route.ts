import "server-only";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendWeeklyDigestForUser } from "@/lib/weekly-digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!expectedSecret || token !== expectedSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const users = await db.user.findMany({ select: { id: true, email: true, name: true } });
  const now = new Date();
  const results: Array<{ userId: string; email: string | null; sent: boolean; skipped?: string; error?: string }> = [];
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of users) {
    try {
      const result = await sendWeeklyDigestForUser(user, { mode: "auto", now });
      if (result.sent) {
        sent += 1;
      } else {
        skipped += 1;
      }
      results.push({ userId: user.id, email: user.email, sent: result.sent, skipped: result.skipped });
    } catch (error) {
      failed += 1;
      results.push({
        userId: user.id,
        email: user.email,
        sent: false,
        error: error instanceof Error ? error.message : "failed",
      });
    }
  }

  return NextResponse.json({
    ok: failed === 0,
    sent,
    skipped,
    failed,
    results: results.slice(0, 50),
  });
}
