import { NextResponse } from "next/server";

import { auditLog, requireSession, unauthorized } from "@/lib/api-security";
import { db } from "@/lib/db";
import { DEFAULT_APP_SETTINGS, mergeAppSettings } from "@/lib/default-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readSettings() {
  const row = await db.settings.findUnique({ where: { id: "global" } });
  if (!row) return DEFAULT_APP_SETTINGS;
  try {
    return mergeAppSettings(JSON.parse(row.data));
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();

  const settings = await readSettings();
  await auditLog({ action: "read_settings", entityType: "settings", entityId: "global" });
  return NextResponse.json({ ok: true, settings });
}

export async function PATCH(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid settings payload" }, { status: 400 });
  }

  const current = await readSettings();
  const next = mergeAppSettings({
    ...current,
    ...(payload as object),
  });

  await db.settings.upsert({
    where: { id: "global" },
    update: { data: JSON.stringify(next) },
    create: { id: "global", data: JSON.stringify(next) },
  });

  await auditLog({ action: "update_settings", entityType: "settings", entityId: "global" });
  return NextResponse.json({ ok: true, settings: next });
}
