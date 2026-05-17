import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { auditLog, requireSession, unauthorized } from "@/lib/api-security";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roleSchema = z.enum(["admin", "advisor"]);

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1),
  role: roleSchema.default("advisor"),
  password: z.string().min(12),
});

async function requireAdmin() {
  const session = await requireSession();
  if (!session) return { ok: false as const, response: await unauthorized() };
  if (session.user.role !== "admin") {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true as const, session };
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const users = await db.user.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          clients: true,
          policies: true,
        },
      },
    },
  });

  await auditLog({ action: "admin_list_users", entityType: "user" });

  return NextResponse.json({
    ok: true,
    users: users.map((user) => ({
      ...user,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const payload = await request.json().catch(() => null);
  const parsed = createUserSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase();

  try {
    const user = await db.user.create({
      data: {
        email,
        name: parsed.data.name.trim(),
        role: parsed.data.role,
        passwordHash: await bcrypt.hash(parsed.data.password, 12),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            clients: true,
            policies: true,
          },
        },
      },
    });

    await auditLog({
      action: "admin_create_user",
      entityType: "user",
      entityId: user.id,
      metadata: { role: user.role },
    });

    return NextResponse.json({
      ok: true,
      user: {
        ...user,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Unique constraint")) {
      return NextResponse.json(
        { ok: false, error: "That email is already used by another user" },
        { status: 409 },
      );
    }

    console.error("[admin/users] create failed:", error);
    return NextResponse.json({ ok: false, error: "Unable to create user" }, { status: 500 });
  }
}
