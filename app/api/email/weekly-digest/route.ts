import "server-only";

import { NextResponse } from "next/server";
import { requireSession, unauthorized } from "@/lib/api-security";
import { buildWeeklyDigest, renderWeeklyDigestHtml, sendWeeklyDigestForUser } from "@/lib/weekly-digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();

  const digest = await buildWeeklyDigest(session.user.id);
  return NextResponse.json({
    ok: true,
    counts: {
      premiums: digest.premiumRows.length,
      birthdays: digest.birthdayRows.length,
      overdueFollowUps: digest.overdueFollowUps.length,
    },
    html: renderWeeklyDigestHtml(digest),
  });
}

export async function POST() {
  const session = await requireSession();
  if (!session) return unauthorized();

  try {
    const result = await sendWeeklyDigestForUser(
      { id: session.user.id, email: session.user.email ?? null, name: session.user.name ?? null },
      { mode: "manual" }
    );
    if (!result.sent) {
      return NextResponse.json({ ok: false, error: result.skipped ?? "Weekly digest was not sent" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, messageId: result.messageId, recipient: result.recipient });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("SMTP_PASSWORD")
      ? "SMTP_PASSWORD is not configured"
      : "Weekly digest could not be sent";
    return NextResponse.json({ ok: false, error: message }, { status: message.includes("SMTP_PASSWORD") ? 503 : 500 });
  }
}
