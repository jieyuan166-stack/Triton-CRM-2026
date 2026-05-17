import { NextResponse } from "next/server";
import { z } from "zod";

import { auditLog, requireSession, unauthorized } from "@/lib/api-security";
import { db } from "@/lib/db";
import { buildDefaultSettingsForUser, mergeAppSettings } from "@/lib/default-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const emailTemplateAttachmentSchema = z.object({
  id: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().nonnegative(),
  content: z.string().min(1),
});

const emailTemplateSchema = z.object({
  id: z.enum(["birthday", "renewal", "festival"]),
  label: z.string().min(1),
  subject: z.string(),
  body: z.string(),
  attachments: z.array(emailTemplateAttachmentSchema).optional(),
  variables: z.array(z.string()).optional(),
});

const settingsPatchSchema = z.object({
  profile: z.object({
    id: z.string().optional(),
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    passwordUpdatedAt: z.string().optional(),
  }).optional(),
  email: z.object({
    host: z.string().min(1).optional(),
    port: z.number().int().min(1).max(65535).optional(),
    secure: z.boolean().optional(),
    user: z.string().optional(),
    fromName: z.string().optional(),
    fromEmail: z.string().email().or(z.literal("")).optional(),
    passwordConfigured: z.boolean().optional(),
  }).optional(),
  weeklyDigest: z.object({
    enabled: z.boolean().optional(),
    weekday: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday"]).optional(),
    time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    recipientEmail: z.string().email().or(z.literal("")).optional(),
  }).optional(),
  emailAutomation: z.object({
    premiumRemindersEnabled: z.boolean().optional(),
    birthdayGreetingsEnabled: z.boolean().optional(),
  }).optional(),
  templates: z.array(emailTemplateSchema).optional(),
  signature: z.object({
    enabled: z.boolean().optional(),
    text: z.string().optional(),
    html: z.string().optional(),
  }).optional(),
}).strict();

async function readSettings(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });
  if (!user) {
    throw new Error("User not found");
  }
  const defaults = buildDefaultSettingsForUser(user);
  const row = await db.settings.findUnique({ where: { userId } });
  if (!row) return defaults;
  try {
    return mergeAppSettings(JSON.parse(row.data), defaults);
  } catch {
    return defaults;
  }
}

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();

  const settings = await readSettings(session.user.id);
  await auditLog({ action: "read_settings", entityType: "settings", entityId: session.user.id });
  return NextResponse.json({ ok: true, settings });
}

export async function PATCH(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const payload = await request.json().catch(() => null);
  const parsed = settingsPatchSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid settings payload", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const current = await readSettings(session.user.id);
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true },
  });
  if (!user) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }
  const defaults = buildDefaultSettingsForUser(user);
  const next = mergeAppSettings({
    ...current,
    ...parsed.data,
  }, defaults);

  await db.settings.upsert({
    where: { userId: session.user.id },
    update: { data: JSON.stringify(next) },
    create: { userId: session.user.id, data: JSON.stringify(next) },
  });

  await auditLog({ action: "update_settings", entityType: "settings", entityId: session.user.id });
  return NextResponse.json({ ok: true, settings: next });
}
