import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { requireSession, unauthorized, auditLog } from "@/lib/api-security";
import { db } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(12).optional(),
});

export async function PATCH(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const limited = rateLimit(`credentials:${session.user.id}:${getClientIp(request)}`, {
    limit: 5,
    windowMs: 5 * 60 * 1000,
  });
  if (!limited.ok) {
    return NextResponse.json({ ok: false, error: "Too many attempts" }, { status: 429 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (!parsed.data.email && !parsed.data.password) {
    return NextResponse.json({ ok: false, error: "No changes provided" }, { status: 400 });
  }

  const data: { email?: string; passwordHash?: string } = {};
  if (parsed.data.email) data.email = parsed.data.email.toLowerCase();
  if (parsed.data.password) data.passwordHash = await bcrypt.hash(parsed.data.password, 12);

  try {
    const user = await db.user.update({
      where: { id: session.user.id },
      data,
      select: { id: true, email: true },
    });

    await auditLog({
      action: "update_credentials",
      entityType: "user",
      entityId: user.id,
      metadata: { changedEmail: !!data.email, changedPassword: !!data.passwordHash },
    });

    return NextResponse.json({ ok: true, email: user.email });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Unique constraint")) {
      return NextResponse.json(
        { ok: false, error: "That sign-in email is already used by another account" },
        { status: 409 },
      );
    }

    console.error("[account/credentials] update failed:", error);
    return NextResponse.json({ ok: false, error: "Unable to update credentials" }, { status: 500 });
  }
}
