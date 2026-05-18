import "server-only";

import nodemailer from "nodemailer";
import { db } from "@/lib/db";
import { emailDefaults, serverEnv } from "@/lib/env.server";
import { formatCurrencyShort } from "@/lib/format";
import { daysUntil, formatDate, resolveRecurringDate } from "@/lib/date-utils";
import { buildDefaultSettingsForUser, mergeAppSettings } from "@/lib/default-settings";
import type { AppSettings } from "@/lib/settings-types";

type SettingsUser = { id: string; email: string | null; name: string | null };

type WeeklyDigestMode = "manual" | "auto";

export type WeeklyDigestSendResult = {
  sent: boolean;
  skipped?: string;
  messageId?: string;
  recipient?: string;
};

export async function readWeeklyDigestSettings(userId: string): Promise<AppSettings> {
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
    .replace(/\"/g, "&quot;");
}

export async function buildWeeklyDigest(userId: string) {
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

export function renderWeeklyDigestHtml(digest: Awaited<ReturnType<typeof buildWeeklyDigest>>) {
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

function localParts(now: Date, timeZone = "America/Vancouver") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    weekday: get("weekday").toLowerCase(),
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

function minutesFromTime(value: string) {
  const [hour, minute] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 8 * 60;
  return hour * 60 + minute;
}

export function weeklyDigestCycleKey(settings: AppSettings, now = new Date()) {
  const local = localParts(now);
  return `${local.year}-${local.month}-${local.day}:${settings.weeklyDigest.weekday}:${settings.weeklyDigest.time}`;
}

export function isWeeklyDigestDue(settings: AppSettings, now = new Date()) {
  if (!settings.weeklyDigest.enabled) return false;
  const local = localParts(now);
  if (local.weekday !== settings.weeklyDigest.weekday) return false;
  const target = minutesFromTime(settings.weeklyDigest.time);
  const current = local.hour * 60 + local.minute;
  // Send once any time after the scheduled time on the chosen day. The audit
  // cycle key below prevents duplicate sends, while this wider window avoids a
  // missed digest after deploys, NAS restarts, or cron delays.
  return current >= target;
}

async function alreadySentAutomaticDigest(userId: string, cycleKey: string, now: Date) {
  const recent = await db.auditLog.findMany({
    where: {
      userId,
      action: "send_weekly_digest_auto",
      entityType: "settings",
      entityId: userId,
      createdAt: { gte: new Date(now.getTime() - 36 * 60 * 60 * 1000) },
    },
    select: { metadata: true },
  });

  return recent.some((log) => {
    if (!log.metadata) return false;
    try {
      return (JSON.parse(log.metadata) as { cycleKey?: string }).cycleKey === cycleKey;
    } catch {
      return false;
    }
  });
}

export async function sendWeeklyDigestForUser(
  user: SettingsUser,
  options: { mode: WeeklyDigestMode; now?: Date } = { mode: "manual" }
): Promise<WeeklyDigestSendResult> {
  const now = options.now ?? new Date();
  const settings = await readWeeklyDigestSettings(user.id);
  if (!settings.weeklyDigest.enabled) {
    return { sent: false, skipped: "Weekly digest disabled" };
  }

  const cycleKey = weeklyDigestCycleKey(settings, now);
  if (options.mode === "auto") {
    if (!isWeeklyDigestDue(settings, now)) {
      return { sent: false, skipped: "Outside scheduled window" };
    }
    if (await alreadySentAutomaticDigest(user.id, cycleKey, now)) {
      return { sent: false, skipped: "Already sent for this cycle" };
    }
  }

  const password = serverEnv.getSmtpPassword();
  const digest = await buildWeeklyDigest(user.id);
  const transporter = nodemailer.createTransport({
    host: settings.email.host || emailDefaults.host,
    port: settings.email.port || emailDefaults.port,
    secure: settings.email.secure ?? emailDefaults.secure,
    auth: { user: settings.email.user || emailDefaults.user, pass: password },
  });

  const fromName = settings.email.fromName || emailDefaults.fromName;
  const fromEmail = settings.email.fromEmail || emailDefaults.fromEmail || emailDefaults.user;
  const recipient = settings.weeklyDigest.recipientEmail || settings.profile.email || user.email || emailDefaults.user;
  if (!recipient) return { sent: false, skipped: "No recipient configured" };

  const info = await transporter.sendMail({
    from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
    to: recipient,
    subject: "Triton CRM Weekly Advisor Digest",
    html: renderWeeklyDigestHtml(digest),
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: options.mode === "auto" ? "send_weekly_digest_auto" : "send_weekly_digest",
      entityType: "settings",
      entityId: user.id,
      metadata: JSON.stringify({ recipient, messageId: info.messageId, cycleKey }),
    },
  });

  return { sent: true, messageId: info.messageId, recipient };
}
