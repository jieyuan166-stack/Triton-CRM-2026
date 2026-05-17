// Deprecated compatibility route. New callers should use /api/send-email.

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectToSendEmail(request: Request) {
  return NextResponse.redirect(new URL("/api/send-email", request.url), 308);
}

export function GET(request: Request) {
  return redirectToSendEmail(request);
}

export function POST(request: Request) {
  return redirectToSendEmail(request);
}
