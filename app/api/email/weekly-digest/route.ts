import "server-only";

import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { requireSession, unauthorized, auditLog } from "@/lib/api-security";
import { db } from "@/lib/db";
import { emailDefaults, serverEnv } from "@/lib/env.server";
import { formatCurrencyShort } from "@/lib/format";
import { daysUntil, formatDate, resolveRecurringDate } from "@/lib/date-utils";
import { buildDefaultSettingsForUser, mergeAppSettings } from "@/lib/default-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readSettings(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });
  if (!user) throw new Error("User not found");
  const defaults = buildDefaultSettingsForUser(user);
  const row = await db.settings.findUnique({ where: { userId } });
  if (!row) return defaults;
  return mergeAppSettings(JSON.parse(row.data), defaults);
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function buildDigest(userId: string) {
  const [clients, policies, followUps] = await Promise.all([
    db.client.findMany({ where: { userId }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    db.policy.findMany({ where: { userId, status: "active" }, orderBy: { premiumDate: "asc" } }),
    db.followUp.findMany({ where: { client: { userId } }, orderBy: { date: "asc" } }),
  ]);
  const clientsById = new Map(clients.map((client) => [client.id, client]));

  const premiumRows = policies
    .filter((policy) => policy.category === "Insurance" && !!policy.premiumDate)
    .map((policy) => {
      const dueDate = resolveRecurringDate(policy.premiumDate!);
      return { policy, client: clientsById.get(policy.clientId), dueDate, days: daysUntil(dueDate) };
    })
    .filter((row) => row.days >= 0 && row.days <= 7)
    .slice(0, 20);

  const birthdayRows = clients
    .filter((client) => !!client.birthday)
    .map((client) => ({
      client,
      days: daysUntil(client.birthday!.toISOString().slice(5, 10)),
    }))
    .filter((row) => row.days >= 0 && row.days <= 7)
    .slice(0, 20);

  const overdueFollowUps = followUps
    .filter((followUp) => daysUntil(followUp.date.toISOString().slice(0, 10)) < 0)
    .slice(0, 20);

  return { premiumRows, birthdayRows, overdueFollowUps, clientsById };
}

function renderDigestHtml(digest: Awaited<ReturnType<typeof buildDigest>>) {
  const premiumItems = digest.premiumRows
    .map(({ policy, client, dueDate }) => {
      const name = client ? `${client.firstName} ${client.lastName}` : "Unknown client";
      return `<li><strong>${escapeHtml(name)}</strong> — ${escapeHtml(policy.carrier)} ${escapeHtml(policy.productName || policy.productType)} #${escapeHtml(policy.policyNumber)} · ${formatCurrencyShort(policy.premium)} due ${formatDate(dueDate)}</li>`;
    })
    .join("");
  const birthdayItems = digest.birthdayRows
    .map(({ client, days }) => `<li><strong>${escapeHtml(`${client.firstName} ${client.lastName}`)}</strong> — ${days === 0 ? "today" : `in ${days} days`}</li>`)
    .join("");
  const followUpItems = digest.overdueFollowUps
    .map((followUp) => {
      const client = digest.clientsById.get(followUp.clientId);
      const name = client ? `${client.firstName} ${client.lastName}` : "Unknown client";
      return `<li><strong>${escapeHtml(name)}</strong> — ${escapeHtml(followUp.summary)} (${formatDate(followUp.date.toISOString().slice(0, 10))})</li>`;
    })
    .join("");

  return `<div style="font-family: Geist, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, sans-serif; font-size:14px; line-height:1.6; color:#0f172a;">
    <h2 style="margin:0 0 12px; color:#002147;">Triton CRM Weekly Advisor Digest</h2>
    <p style="margin:0 0 20px; color:#64748b;">Advisor-only operational summary. No customer emails were sent.</p>
    <h3 style="font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:#64748b;">Premiums due in 7 days</h3>
    <ul>${premiumItems || "<li>No premiums due this week.</li>"}</ul>
    <h3 style="font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:#64748b;">Birthdays in 7 days</h3>
    <ul>${birthdayItems || "<li>No birthdays this week.</li>"}</ul>
    <h3 style="font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:#64748b;">Overdue follow-ups</h3>
    <ul>${followUpItems || "<li>No overdue follow-ups.</li>"}</ul>
  </div>`;
}

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();

  const digest = await buildDigest(session.user.id);
  return NextResponse.json({
    ok: true,
    counts: {
      premiums: digest.premiumRows.length,
      birthdays: digest.birthdayRows.length,
      overdueFollowUps: digest.overdueFollowUps.length,
    },
    html: renderDigestHtml(digest),
  });
}

export async function POST() {
  const session = await requireSession();
  if (!session) return unauthorized();

  const settings = await readSettings(session.user.id);
  if (!settings.weeklyDigest.enabled) {
    return NextResponse.json({ ok: false, error: "Weekly digest is disabled" }, { status: 400 });
  }

  let password: string;
  try {
    password = serverEnv.getSmtpPassword();
  } catch {
    return NextResponse.json({ ok: false, error: "SMTP_PASSWORD is not configured" }, { status: 503 });
  }

  const digest = await buildDigest(session.user.id);
  const transporter = nodemailer.createTransport({
    host: emailDefaults.host,
    port: emailDefaults.port,
    secure: emailDefaults.secure,
    auth: { user: emailDefaults.user, pass: password },
  });

  const fromName = settings.email.fromName || emailDefaults.fromName;
  const fromEmail = settings.email.fromEmail || emailDefaults.fromEmail || emailDefaults.user;
  const recipient = settings.weeklyDigest.recipientEmail || settings.profile.email;
  const info = await transporter.sendMail({
    from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
    to: recipient,
    subject: "Triton CRM Weekly Advisor Digest",
    html: renderDigestHtml(digest),
  });

  await auditLog({
    action: "send_weekly_digest",
    entityType: "settings",
    entityId: session.user.id,
    metadata: { recipient, messageId: info.messageId },
  });

  return NextResponse.json({ ok: true, messageId: info.messageId });
}
