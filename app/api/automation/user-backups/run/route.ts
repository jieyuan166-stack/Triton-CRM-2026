import "server-only";

import { NextResponse } from "next/server";

import { auditLog } from "@/lib/api-security";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { createSnapshotBackup } from "@/lib/server-backups";
import { buildUserSnapshot } from "@/lib/user-backup-snapshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  return isAuthorizedCronRequest(request);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const users = await db.user.findMany({
    where: { role: { not: "admin" } },
    select: { id: true, email: true, name: true, role: true },
    orderBy: { email: "asc" },
  });

  const results: Array<{
    userId: string;
    email: string | null;
    created: boolean;
    filename?: string;
    error?: string;
  }> = [];
  let created = 0;
  let failed = 0;

  for (const user of users) {
    try {
      const snapshot = await buildUserSnapshot(user.id);
      const record = await createSnapshotBackup(snapshot, user);
      created += 1;
      results.push({
        userId: user.id,
        email: user.email,
        created: true,
        filename: record.filename,
      });
      await auditLog({
        action: "create_user_backup_auto",
        entityType: "backup",
        entityId: record.filename,
        metadata: { userId: user.id, email: user.email, kind: record.kind },
      });
    } catch (error) {
      failed += 1;
      console.error("[automation:user-backups] failed", {
        userId: user.id,
        email: user.email,
        error,
      });
      results.push({
        userId: user.id,
        email: user.email,
        created: false,
        error: error instanceof Error ? error.message : "failed",
      });
    }
  }

  return NextResponse.json({
    ok: failed === 0,
    created,
    failed,
    results,
  });
}
