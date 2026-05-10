import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session;
}

export async function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export async function auditLog(input: {
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) {
  const session = await auth();
  await db.auditLog.create({
    data: {
      userId: session?.user?.id || undefined,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
    },
  });
}
