import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { auditLog, requireSession, unauthorized } from "@/lib/api-security";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roleSchema = z.enum(["admin", "advisor"]);

const updateUserSchema = z.object({
  name: z.string().trim().min(1).optional(),
  role: roleSchema.optional(),
  password: z.string().min(12).optional(),
}).refine((value) => value.name !== undefined || value.role !== undefined || value.password !== undefined, {
  message: "No changes provided",
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { id } = await params;
  const payload = await request.json().catch(() => null);
  const parsed = updateUserSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const target = await db.user.findUnique({
    where: { id },
    select: { id: true, email: true, role: true },
  });
  if (!target) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  const data: { name?: string; role?: string; passwordHash?: string } = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.password !== undefined) {
    data.passwordHash = await bcrypt.hash(parsed.data.password, 12);
  }

  const user = await db.user.update({
    where: { id },
    data,
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
    action: "admin_update_user",
    entityType: "user",
    entityId: user.id,
    metadata: {
      changedName: parsed.data.name !== undefined,
      changedRole: parsed.data.role !== undefined,
      resetPassword: parsed.data.password !== undefined,
    },
  });

  return NextResponse.json({
    ok: true,
    user: {
      ...user,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { id } = await params;
  if (id === admin.session.user.id) {
    return NextResponse.json({ ok: false, error: "You cannot delete your own account" }, { status: 400 });
  }

  const target = await db.user.findUnique({
    where: { id },
    select: { id: true, email: true, role: true },
  });
  if (!target) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  if (target.email === "admin@tritonwealth.ca" || target.role === "admin") {
    return NextResponse.json({ ok: false, error: "Admin accounts cannot be deleted" }, { status: 400 });
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.auditLog.deleteMany({ where: { userId: target.id } });
      await tx.user.delete({ where: { id: target.id } });
    });

    await auditLog({
      action: "admin_delete_user",
      entityType: "user",
      entityId: target.id,
      metadata: { email: target.email },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin/users] delete failed:", error);
    return NextResponse.json({ ok: false, error: "Unable to delete user" }, { status: 500 });
  }
}
