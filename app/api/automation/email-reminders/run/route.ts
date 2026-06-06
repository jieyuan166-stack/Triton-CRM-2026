import "server-only";

import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { auditLog } from "@/lib/api-security";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { emailDefaults } from "@/lib/env.server";
import { buildDefaultSettingsForUser, mergeAppSettings } from "@/lib/default-settings";
import { canSendToEmail } from "@/lib/email-address";
import { formatCurrency } from "@/lib/format";
import { resolveSmtpAccount } from "@/lib/smtp-account";
import {
  applyTemplate,
  renderEmailBody,
  renderEmailHtml,
  shouldIncludeBirthdayCardForAdvisor,
} from "@/lib/templates";
import {
  getPremiumReminderStage,
  premiumReminderCycleKey,
  premiumReminderDedupeKey,
  premiumReminderStageLabel,
  resolvePremiumReminderDate,
} from "@/lib/premium-reminders";
import { daysUntil, formatDate } from "@/lib/date-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVINCE_TIMEZONES: Record<string, string> = {
  BC: "America/Vancouver",
  AB: "America/Edmonton",
  ON: "America/Toronto",
};

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

function fullName(client: { firstName: string; lastName: string }) {
  return `${client.firstName} ${client.lastName}`.trim();
}

function localParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

function birthdayMonthDay(value: Date | null) {
  if (!value) return "";
  return value.toISOString().slice(5, 10);
}

function insertStageIfMissing(input: { subject: string; body: string; stageLabel: string }) {
  return {
    subject: input.subject.includes(input.stageLabel)
      ? input.subject
      : `${input.stageLabel} · ${input.subject}`,
    body: input.body.includes(input.stageLabel)
      ? input.body
      : `${input.stageLabel}\n\n${input.body}`,
  };
}

async function createTransporter(settings: Awaited<ReturnType<typeof readSettings>>) {
  const fromEmail = settings.email.fromEmail || emailDefaults.fromEmail || emailDefaults.user;
  const smtpAccount = resolveSmtpAccount({
    user: settings.email.user || emailDefaults.user,
    fromEmail,
  });
  return nodemailer.createTransport({
    host: settings.email.host || emailDefaults.host,
    port: settings.email.port || emailDefaults.port,
    secure: settings.email.secure ?? emailDefaults.secure,
    auth: { user: smtpAccount.user, pass: smtpAccount.password },
  });
}

export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const users = await db.user.findMany({ select: { id: true, email: true } });
  const now = new Date();
  const errors: string[] = [];
  const skippedReasons: string[] = [];
  let sent = 0;
  let skipped = 0;

  for (const user of users) {
  const settings = await readSettings(user.id);
  if (!settings.emailAutomation.premiumRemindersEnabled && !settings.emailAutomation.birthdayGreetingsEnabled) {
    continue;
  }

  const transporter = await createTransporter(settings);
  const fromName = settings.email.fromName || emailDefaults.fromName;
  const fromEmail = settings.email.fromEmail || emailDefaults.fromEmail || emailDefaults.user;
  const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

  if (settings.emailAutomation.premiumRemindersEnabled) {
    const renewalTpl = settings.templates.find((template) => template.id === "renewal");
    const policies = await db.policy.findMany({
      where: { userId: user.id, status: "active", category: "Insurance", premiumDate: { not: null } },
      include: { client: true, jointWithClient: true },
    });

    for (const policy of policies) {
      const dueDate = resolvePremiumReminderDate(policy.premiumDate!, now);
      const dueInDays = daysUntil(dueDate, now);
      const stage = getPremiumReminderStage(dueInDays);
      if (!stage || !renewalTpl) continue;
      const stageLabel = premiumReminderStageLabel(stage);
      const cycleKey = premiumReminderCycleKey({ id: policy.id } as never, dueDate);
      const recipients = [policy.client];
      if (policy.isJoint && policy.jointWithClient && policy.jointWithClient.id !== policy.clientId) {
        recipients.push(policy.jointWithClient);
      }

      for (const client of recipients) {
        if (!canSendToEmail(client.email)) {
          skipped += 1;
          skippedReasons.push("Premium " + policy.policyNumber + " / " + (fullName(client) || client.id) + ": no deliverable email");
          continue;
        }
        const dedupeKey = premiumReminderDedupeKey({ policyId: policy.id, clientId: client.id, cycleKey, stage });
        const existing = await db.emailReminderSend.findUnique({ where: { dedupeKey } });
        if (existing) {
          skipped += 1;
          continue;
        }
        const premiumAmount = formatCurrency(policy.premium ?? 0);
        const totalCoverage = formatCurrency(policy.sumAssured ?? 0);
        const formattedDueDate = formatDate(dueDate);
        const vars = {
          "Client Name": fullName(client),
          Carrier: policy.carrier,
          "Policy Name": policy.productName || policy.productType,
          "Policy Number": policy.policyNumber,
          "Total Coverage": totalCoverage,
          "Death Benefit": totalCoverage,
          "Face Amount": totalCoverage,
          "Premium Amount": premiumAmount,
          Date: formattedDueDate,
          "Reminder Stage": stageLabel,
        };
        const rendered = insertStageIfMissing({
          subject: applyTemplate(renewalTpl.subject, vars),
          body: applyTemplate(renewalTpl.body, vars),
          stageLabel,
        });
        try {
          const info = await transporter.sendMail({
            from,
            to: client.email,
            subject: rendered.subject,
            text: renderEmailBody(rendered.body, {}, settings.signature),
            html: renderEmailHtml(rendered.body, {}, settings.signature, {
              template: "renewal",
              emphasizedTerms: [policy.policyNumber, premiumAmount, totalCoverage, formattedDueDate],
            }),
          });
          await db.$transaction([
            db.emailHistory.create({
              data: {
                clientId: client.id,
                date: new Date(),
                subject: rendered.subject,
                body: rendered.body,
                templateLabel: `Renewal Reminder · ${stageLabel} · ${policy.carrier} · #${policy.policyNumber}`,
                policyId: policy.id,
                policyNumber: policy.policyNumber,
                policyLabel: `${policy.carrier} ${policy.productName || policy.productType}`.trim(),
                communicationType: "Renewal Reminder",
              },
            }),
            db.emailReminderSend.create({
              data: {
                dedupeKey,
                policyId: policy.id,
                clientId: client.id,
                type: "premium",
                stage,
                cycleKey,
                source: "auto",
                messageId: info.messageId,
                sentAt: new Date(),
              },
            }),
            db.policy.update({ where: { id: policy.id }, data: { lastRenewalEmailAt: new Date() } }),
            db.client.update({ where: { id: client.id }, data: { lastContactedAt: new Date() } }),
          ]);
          await auditLog({
            action: "auto_send_premium_reminder",
            entityType: "policy",
            entityId: policy.id,
            metadata: { clientId: client.id, stage, cycleKey, messageId: info.messageId },
          });
          sent += 1;
        } catch (error) {
          errors.push(`Premium ${policy.policyNumber} / ${client.email}: ${error instanceof Error ? error.message : "failed"}`);
        }
      }
    }
  }

  if (settings.emailAutomation.birthdayGreetingsEnabled) {
    const birthdayTpl = settings.templates.find((template) => template.id === "birthday");
    if (birthdayTpl) {
      const clients = await db.client.findMany({ where: { userId: user.id, birthday: { not: null } } });
      for (const client of clients) {
        if (!canSendToEmail(client.email)) {
          skipped += 1;
          skippedReasons.push("Birthday " + (fullName(client) || client.id) + ": no deliverable email");
          continue;
        }
        const timeZone = PROVINCE_TIMEZONES[client.province ?? ""] ?? "America/Vancouver";
        const local = localParts(now, timeZone);
        if (local.hour !== 0) continue;
        if (`${local.month}-${local.day}` !== birthdayMonthDay(client.birthday)) continue;
        const cycleKey = `${client.id}:${local.year}`;
        const dedupeKey = `birthday:${client.id}:${cycleKey}`;
        const existing = await db.emailReminderSend.findUnique({ where: { dedupeKey } });
        if (existing) {
          skipped += 1;
          continue;
        }
        const vars = { "Client Name": fullName(client), Date: `${local.year}-${local.month}-${local.day}` };
        const subject = applyTemplate(birthdayTpl.subject, vars);
        const body = applyTemplate(birthdayTpl.body, vars);
        try {
          const info = await transporter.sendMail({
            from,
            to: client.email,
            subject,
            text: renderEmailBody(body, {}, settings.signature),
            html: renderEmailHtml(body, {}, settings.signature, {
              template: "birthday",
              birthdayCardEnabled: shouldIncludeBirthdayCardForAdvisor(settings.profile.email),
            }),
          });
          await db.$transaction([
            db.emailHistory.create({
              data: {
                clientId: client.id,
                date: new Date(),
                subject,
                body,
                templateLabel: "Birthday Greeting",
              },
            }),
            db.emailReminderSend.create({
              data: {
                dedupeKey,
                clientId: client.id,
                type: "birthday",
                cycleKey,
                source: "auto",
                messageId: info.messageId,
                sentAt: new Date(),
              },
            }),
            db.client.update({
              where: { id: client.id },
              data: { lastBirthdayEmailAt: new Date(), lastContactedAt: new Date() },
            }),
          ]);
          await auditLog({
            action: "auto_send_birthday_greeting",
            entityType: "client",
            entityId: client.id,
            metadata: { cycleKey, messageId: info.messageId, timeZone },
          });
          sent += 1;
        } catch (error) {
          errors.push(`Birthday ${client.email}: ${error instanceof Error ? error.message : "failed"}`);
        }
      }
    }
  }
  }

  return NextResponse.json({
    ok: true,
    sent,
    skipped,
    skippedReasons: skippedReasons.slice(0, 20),
    errors: errors.slice(0, 20),
  });
}
