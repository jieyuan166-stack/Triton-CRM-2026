// app/api/settings/email-status/route.ts
// Reports whether the SMTP password env var is set, WITHOUT returning the
// value. The UI uses this to render a green "Configured" / amber "Not set"
// badge in Settings → Email Configuration.
//
// Step 10 will gate this behind the auth middleware so only admins can hit it.

import { NextResponse } from "next/server";
import { requireSession, unauthorized } from "@/lib/api-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();

  const passwordConfigured = !!process.env.SMTP_PASSWORD;
  return NextResponse.json({ passwordConfigured });
}
