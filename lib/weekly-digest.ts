import "server-only";

import nodemailer from "nodemailer";
import { db } from "@/lib/db";
import { emailDefaults } from "@/lib/env.server";
import { formatCurrencyShort } from "@/lib/format";
import { daysUntil, formatDate, resolveRecurringDate } from "@/lib/date-utils";
import { buildDefaultSettingsForUser, mergeAppSettings } from "@/lib/default-settings";
import { resolveSmtpAccount } from "@/lib/smtp-account";
import type { AppSettings } from "@/lib/settings-types";
import { digestFollowUpGroups } from "@/lib/automation-calendar";
import { deliverOnce } from "@/lib/email-delivery";

type SettingsUser = { id: string; email: string | null; name: string | null };

type WeeklyDigestMode = "manual" | "auto";

export type WeeklyDigestSendResult = {
  sent: boolean;
  skipped?: string;
  messageId?: string;
  recipient?: string;
  deliveryRecipient?: string;
  deliveryStatus?: "sent" | "skipped" | "failed" | "review";
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

export async function buildWeeklyDigest(userId: string, now = new Date()) {
  const [clients, policies, followUps] = await Promise.all([
    db.client.findMany({ where: { userId }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    db.policy.findMany({ where: { userId, status: "active" }, orderBy: { premiumDate: "asc" } }),
    db.followUp.findMany({
      where: { client: { userId }, completedAt: null },
      orderBy: [{ deadline: "asc" }, { date: "asc" }],
    }),
  ]);
  const clientsById = new Map(clients.map((client) => [client.id, client]));

  const premiumRows = policies
    .filter((policy) => policy.category === "Insurance" && !!policy.premiumDate)
    .map((policy) => {
      const dueDate = resolveRecurringDate(policy.premiumDate!, now);
      return { policy, client: clientsById.get(policy.clientId), dueDate, days: daysUntil(dueDate, now) };
    })
    .filter((row) => row.days >= 0 && row.days <= 7)
    .sort((a, b) => a.days - b.days);

  const birthdayRows = clients
    .filter((client) => !!client.birthday)
    .map((client) => ({
      client,
      days: daysUntil(client.birthday!.toISOString().slice(5, 10), now),
    }))
    .filter((row) => row.days >= 0 && row.days <= 7)
    .sort((a, b) => a.days - b.days);

  const { overdue: overdueFollowUps, highPriority: highPriorityFollowUps } = digestFollowUpGroups(followUps, now);
  return { premiumRows, birthdayRows, overdueFollowUps, highPriorityFollowUps, clientsById };
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
      const target = (followUp.deadline ?? followUp.date).toISOString().slice(0, 10);
      const meta = [formatDate(target), followUp.importance].filter(Boolean).join(" · ");
      return `<li><strong>${escapeHtml(name)}</strong> — ${escapeHtml(followUp.summary)} (${escapeHtml(meta)})</li>`;
    })
    .join("");
  const highPriorityItems = digest.highPriorityFollowUps.map((followUp) => {
    const client = digest.clientsById.get(followUp.clientId);
    const name = client ? client.companyName || `${client.firstName} ${client.lastName}` : "Unknown client";
    return `<li><strong>${escapeHtml(name)}</strong> — ${escapeHtml(followUp.summary)}${followUp.deadline ? ` (Due ${formatDate(followUp.deadline.toISOString().slice(0, 10))})` : ""}</li>`;
  }).join("");

  return `<div style="font-family: Geist, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, sans-serif; font-size:14px; line-height:1.6; color:#0f172a;">
    <h2 style="margin:0 0 12px; color:#002147;">Triton CRM Weekly Advisor Digest</h2>
    <p style="margin:0 0 20px; color:#64748b;">Advisor-only operational summary. No customer emails were sent.</p>
    <h3 style="font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:#64748b;">Premiums due in 7 days</h3>
    <ul>${premiumItems || "<li>No premiums due this week.</li>"}</ul>
    <h3 style="font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:#64748b;">Birthdays in 7 days</h3>
    <ul>${birthdayItems || "<li>No birthdays this week.</li>"}</ul>
    <h3 style="font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:#64748b;">Overdue follow-ups</h3>
    <ul>${followUpItems || "<li>No overdue follow-ups.</li>"}</ul>
    <h3 style="font-size:12px;color:#64748b;">High priority (${digest.highPriorityFollowUps.length})</h3>
    <ul>${highPriorityItems || "<li>No other high-priority follow-ups.</li>"}</ul>
    <p><a href="https://crm.tritonwealth.ca/clients?followUpDue=true&amp;followUpSort=deadline">Review follow-ups in CRM</a></p>
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

function cleanEmail(value: string | null | undefined) {
  return (value ?? "").trim().replace(/^["']|["']$/g, "");
}

function digestDeliveryRecipient(recipient: string, smtpUser: string) {
  const cleanRecipient = cleanEmail(recipient);
  const cleanSmtpUser = cleanEmail(smtpUser);
  if (cleanRecipient.toLowerCase() !== cleanSmtpUser.toLowerCase()) {
    return cleanRecipient;
  }

  const [localPart, domain] = cleanRecipient.split("@");
  const normalizedDomain = (domain ?? "").toLowerCase();
  if (!localPart || !normalizedDomain) return cleanRecipient;
  if (!["gmail.com", "googlemail.com"].includes(normalizedDomain)) {
    return cleanRecipient;
  }
  if (localPart.includes("+")) return cleanRecipient;
  return `${localPart}+tritoncrm@${domain}`;
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

  const digest = await buildWeeklyDigest(user.id, now);
  const fromName = settings.email.fromName || emailDefaults.fromName;
  const fromEmail = cleanEmail(settings.email.fromEmail || emailDefaults.fromEmail || emailDefaults.user);
  const smtpAccount = resolveSmtpAccount({
    user: cleanEmail(settings.email.user || emailDefaults.user),
    fromEmail,
  });
  const transporter = nodemailer.createTransport({
    host: settings.email.host || emailDefaults.host,
    port: settings.email.port || emailDefaults.port,
    secure: settings.email.secure ?? emailDefaults.secure,
    auth: { user: smtpAccount.user, pass: smtpAccount.password },
  });

  const recipient = cleanEmail(user.email);
  if (!recipient) return { sent: false, skipped: "User sign-in email is not configured" };
  const deliveryRecipient = digestDeliveryRecipient(recipient, smtpAccount.user);

  const send = () => transporter.sendMail({
    from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
    to: deliveryRecipient,
    subject: "Triton CRM Weekly Advisor Digest",
    html: renderWeeklyDigestHtml(digest),
  });

  const auditData = {
      userId: user.id,
      action: options.mode === "auto" ? "send_weekly_digest_auto" : "send_weekly_digest",
      entityType: "settings",
      entityId: user.id,
  };
  if (options.mode === "auto") {
    const delivery = await deliverOnce({ userId: user.id, type: "weekly-digest", cycleKey,
      dedupeKey: `weekly-digest:${user.id}:${cycleKey}` }, send, async (tx, messageId) => {
        await tx.auditLog.create({ data: { ...auditData, metadata: JSON.stringify({ recipient, deliveryRecipient, messageId, cycleKey }) } });
      });
    return { sent: delivery.status === "sent", deliveryStatus: delivery.status, skipped: delivery.reason, messageId: delivery.messageId, recipient, deliveryRecipient };
  }
  const info = await send();
  await db.auditLog.create({ data: { ...auditData,
    metadata: JSON.stringify({ recipient, deliveryRecipient, messageId: info.messageId, cycleKey }) } });

  return { sent: true, messageId: info.messageId, recipient, deliveryRecipient };
}
