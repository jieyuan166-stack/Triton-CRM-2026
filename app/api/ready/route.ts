import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ready",
      database: "ok",
      smtpConfigured: !!process.env.SMTP_PASSWORD,
    });
  } catch {
    return NextResponse.json(
      { status: "not_ready", database: "error" },
      { status: 503 },
    );
  }
}
