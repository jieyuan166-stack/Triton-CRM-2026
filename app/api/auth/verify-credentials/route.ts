import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { db } from "@/lib/db";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const limited = rateLimit(`verify-credentials:${getClientIp(request)}`, {
    limit: 20,
    windowMs: 5 * 60 * 1000,
  });

  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many sign-in attempts. Please try again in a few minutes." },
      { status: 429 },
    );
  }

  const payload = await request.json().catch(() => null);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid email or password" }, { status: 400 });
  }

  const user = await db.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    select: { passwordHash: true },
  });

  if (!user) {
    return NextResponse.json({ ok: false, error: "Invalid email or password" }, { status: 401 });
  }

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ ok: false, error: "Invalid email or password" }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
