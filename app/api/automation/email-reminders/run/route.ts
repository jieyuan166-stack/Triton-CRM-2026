import "server-only";
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { emailDefaults } from "@/lib/env.server";
import { buildDefaultSettingsForUser, mergeAppSettings } from "@/lib/default-settings";
import { canSendToEmail } from "@/lib/email-address";
import { formatCurrency } from "@/lib/format";
import { resolveSmtpAccount } from "@/lib/smtp-account";
import { applyTemplate, renderEmailBody, renderEmailHtml, shouldIncludeBirthdayCardForAdvisor } from "@/lib/templates";
import { getPremiumReminderStage, premiumReminderCycleKey, premiumReminderDedupeKey, premiumReminderEmailStageLabel, resolvePremiumReminderDate } from "@/lib/premium-reminders";
import { daysUntil, formatDate } from "@/lib/date-utils";
import { birthdayCycle } from "@/lib/automation-calendar";
import { deliverOnce, runForAdvisor } from "@/lib/email-delivery";
import { followUpReminderDedupeKey, followUpReminderDue } from "@/lib/follow-up-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReminderUser = { id: string; email: string; name: string };

async function runAdvisorFollowUpReminders(user: ReminderUser, now: Date) {
  return runForAdvisor(user.id, "follow-up-reminder", async (record) => {
    const defaults = buildDefaultSettingsForUser(user);
    const row = await db.settings.findUnique({ where: { userId: user.id } });
    const settings = row ? mergeAppSettings(JSON.parse(row.data), defaults) : defaults;
    if (!canSendToEmail(user.email)) {
      record({ status: "skipped", reason: "Advisor sign-in email is not deliverable" });
      return;
    }

    const followUps = await db.followUp.findMany({
      where: {
        client: { userId: user.id },
        completedAt: null,
        deadline: { not: null },
        reminderLeadDays: { not: null },
      },
      include: {
        client: {
          select: { id: true, slug: true, firstName: true, lastName: true, companyName: true },
        },
      },
    });
    const due = followUps.filter((followUp) =>
      followUp.deadline && followUp.reminderLeadDays
        ? followUpReminderDue(
            followUp.deadline.toISOString().slice(0, 10),
            followUp.reminderLeadDays,
            now,
          )
        : false
    );
    if (due.length === 0) {
      record({ status: "skipped", reason: "No advisor follow-up reminders due" });
      return;
    }

    const fromEmail = settings.email.fromEmail || user.email;
    const smtp = resolveSmtpAccount({ user: settings.email.user || user.email, fromEmail });
    const transporter = nodemailer.createTransport({
      host: settings.email.host || emailDefaults.host,
      port: settings.email.port || emailDefaults.port,
      secure: settings.email.secure ?? emailDefaults.secure,
      auth: { user: smtp.user, pass: smtp.password },
      connectionTimeout: 30_000,
      greetingTimeout: 30_000,
      socketTimeout: 60_000,
    });
    const from = { name: settings.email.fromName || user.name, address: fromEmail };

    for (const followUp of due) {
      const deadline = followUp.deadline!.toISOString().slice(0, 10);
      const leadDays = followUp.reminderLeadDays!;
      const clientName =
        followUp.client.companyName ||
        `${followUp.client.firstName} ${followUp.client.lastName}`.trim() ||
        "Client";
      const policy = followUp.policyLabel
        ? `${followUp.policyLabel}${followUp.policyNumber ? ` · #${followUp.policyNumber}` : ""}`
        : followUp.policyNumber
          ? `#${followUp.policyNumber}`
          : "No policy selected";
      const link = `https://crm.tritonwealth.ca/clients/${followUp.client.slug || followUp.client.id}#activity`;
      const subject = `CRM 待办提醒 · ${clientName} · ${followUp.summary}`;
      const body = [
        `${user.name}，您好！`,
        "",
        "这是您设置的客户 Follow-up 提醒：",
        `客户：${clientName}`,
        `事项：${followUp.summary}`,
        `产品：${policy}`,
        `事项日期：${formatDate(deadline)}`,
        `重要性：${followUp.importance || "未设置"}`,
        "",
        `打开 CRM：${link}`,
        "",
        "完成后请在 Activity Timeline 中手动点击 Mark Done；系统不会自动完成任务。",
        "",
        "This is your scheduled CRM follow-up reminder.",
        `Client: ${clientName}`,
        `Task: ${followUp.summary}`,
        `Policy: ${policy}`,
        `Event date: ${formatDate(deadline)}`,
        "Please mark the task done manually in the Activity Timeline after completion.",
      ].join("\n");
      const dedupeKey = followUpReminderDedupeKey({
        userId: user.id,
        followUpId: followUp.id,
        deadline,
        leadDays,
      });
      record(await deliverOnce(
        {
          userId: user.id,
          dedupeKey,
          type: "follow-up-advisor",
          clientId: followUp.clientId,
          policyId: followUp.policyId ?? undefined,
          cycleKey: deadline,
          stage: `${leadDays}-day`,
        },
        () => transporter.sendMail({
          from,
          to: user.email,
          subject,
          text: renderEmailBody(body, {}, settings.signature),
          html: renderEmailHtml(body, {}, settings.signature),
        }),
        async (tx, messageId) => {
          await tx.followUp.update({
            where: { id: followUp.id },
            data: { advisorReminderSentAt: new Date() },
          });
          await tx.auditLog.create({
            data: {
              userId: user.id,
              action: "send_advisor_followup_reminder",
              entityType: "followup",
              entityId: followUp.id,
              metadata: JSON.stringify({ deadline, leadDays, messageId }),
            },
          });
        },
      ));
    }
  });
}

export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const users = await db.user.findMany({ select: { id: true, email: true, name: true } });
  const now = new Date();
  const total = { sent: 0, skipped: 0, failed: 0, review: 0 };
  for (const user of users) {
    const followUpResult = await runAdvisorFollowUpReminders(user, now);
    for (const key of ["sent", "skipped", "failed", "review"] as const) total[key] += followUpResult[key];
    const result = await runForAdvisor(user.id, "customer-email", async (record) => {
      const defaults = buildDefaultSettingsForUser(user);
      const row = await db.settings.findUnique({ where: { userId: user.id } });
      const settings = row ? mergeAppSettings(JSON.parse(row.data), defaults) : defaults;
      if (!settings.emailAutomation.premiumRemindersEnabled && !settings.emailAutomation.birthdayGreetingsEnabled) {
        record({ status: "skipped", reason: "Automation disabled" }); return;
      }
      const fromEmail = settings.email.fromEmail || user.email;
      const smtp = resolveSmtpAccount({ user: settings.email.user || user.email, fromEmail });
      const transporter = nodemailer.createTransport({
        host: settings.email.host || emailDefaults.host, port: settings.email.port || emailDefaults.port,
        secure: settings.email.secure ?? emailDefaults.secure, auth: { user: smtp.user, pass: smtp.password },
        connectionTimeout: 30_000, greetingTimeout: 30_000, socketTimeout: 60_000,
      });
      const from = { name: settings.email.fromName || user.name, address: fromEmail };
      const renewalTpl = settings.templates.find((template) => template.id === "renewal");
      if (settings.emailAutomation.premiumRemindersEnabled && renewalTpl) {
        const policies = await db.policy.findMany({
          where: { userId: user.id, status: "active", category: "Insurance", premiumDate: { not: null } },
          include: { client: true, jointWithClient: true },
        });
        for (const policy of policies) {
          const dueDate = resolvePremiumReminderDate(policy.premiumDate!, now);
          const stage = getPremiumReminderStage(daysUntil(dueDate, now));
          if (!stage) continue;
          const stageLabel = premiumReminderEmailStageLabel(stage);
          const cycleKey = premiumReminderCycleKey({ id: policy.id } as never, dueDate);
          const recipients = [policy.client];
          if (policy.isJoint && policy.jointWithClient && policy.jointWithClient.id !== policy.clientId) recipients.push(policy.jointWithClient);
          for (const client of recipients) {
            if (client.userId !== user.id) continue;
            if (!canSendToEmail(client.email)) { record({ status: "skipped", reason: "No deliverable email" }); continue; }
            const dedupeKey = premiumReminderDedupeKey({ policyId: policy.id, clientId: client.id, cycleKey, stage });
            if (await db.emailReminderSend.findUnique({ where: { dedupeKey } })) { record({ status: "skipped", reason: "Already sent or dismissed" }); continue; }
            const premium = formatCurrency(policy.premium);
            const coverage = formatCurrency(policy.sumAssured);
            const date = formatDate(dueDate);
            const vars = { "Client Name": client.companyName || `${client.firstName} ${client.lastName}`.trim(), Carrier: policy.carrier,
              "Policy Name": policy.productName || policy.productType, "Policy Number": policy.policyNumber,
              "Total Coverage": coverage, "Death Benefit": coverage, "Face Amount": coverage, "Premium Amount": premium,
              Date: date, "Reminder Stage": stageLabel };
            let subject = applyTemplate(renewalTpl.subject, vars);
            let body = applyTemplate(renewalTpl.body, vars);
            if (!subject.includes(stageLabel)) subject = `${stageLabel} · ${subject}`;
            if (!body.includes(stageLabel)) body = `${stageLabel}\n\n${body}`;
            record(await deliverOnce({ userId: user.id, dedupeKey, type: "premium", clientId: client.id, policyId: policy.id, stage, cycleKey },
              () => transporter.sendMail({ from, to: client.email, subject, text: renderEmailBody(body, {}, settings.signature),
                html: renderEmailHtml(body, {}, settings.signature, { template: "renewal", emphasizedTerms: [policy.policyNumber, premium, coverage, date] }) }),
              async (tx, messageId) => {
                await tx.emailHistory.create({ data: { userId: user.id, clientId: client.id, subject, body,
                  templateLabel: `Renewal Reminder · ${stageLabel} · ${policy.carrier} · #${policy.policyNumber}`,
                  policyId: policy.id, policyNumber: policy.policyNumber, policyLabel: `${policy.carrier} ${policy.productName || policy.productType}`, communicationType: "Renewal Reminder" } });
                await tx.emailReminderSend.upsert({ where: { dedupeKey }, update: {}, create: { dedupeKey, policyId: policy.id, clientId: client.id, type: "premium", stage, cycleKey, source: "auto", messageId } });
                await tx.policy.update({ where: { id: policy.id }, data: { lastRenewalEmailAt: new Date() } });
                await tx.client.update({ where: { id: client.id }, data: { lastContactedAt: new Date() } });
                await tx.auditLog.create({ data: { userId: user.id, action: "auto_send_premium_reminder", entityType: "policy", entityId: policy.id, metadata: JSON.stringify({ stage, cycleKey, messageId }) } });
              }));
          }
        }
      }
      const birthdayTpl = settings.templates.find((template) => template.id === "birthday");
      if (settings.emailAutomation.birthdayGreetingsEnabled && birthdayTpl) {
        const clients = await db.client.findMany({ where: { userId: user.id, birthday: { not: null } } });
        for (const client of clients) {
          const local = birthdayCycle(client.birthday, client.province, now);
          if (!local) continue;
          if (!canSendToEmail(client.email)) { record({ status: "skipped", reason: "No deliverable email" }); continue; }
          const cycleKey = `${client.id}:${local.year}`;
          const dedupeKey = `birthday:${client.id}:${cycleKey}`;
          if (await db.emailReminderSend.findUnique({ where: { dedupeKey } })) { record({ status: "skipped", reason: "Already sent" }); continue; }
          const vars = { "Client Name": `${client.firstName} ${client.lastName}`.trim(), Date: local.date };
          const subject = applyTemplate(birthdayTpl.subject, vars);
          const body = applyTemplate(birthdayTpl.body, vars);
          record(await deliverOnce({ userId: user.id, dedupeKey, type: "birthday", clientId: client.id, cycleKey },
            () => transporter.sendMail({ from, to: client.email, subject, text: renderEmailBody(body, {}, settings.signature),
              html: renderEmailHtml(body, {}, settings.signature, { template: "birthday", birthdayCardEnabled: shouldIncludeBirthdayCardForAdvisor(user.email) }) }),
            async (tx, messageId) => {
              await tx.emailHistory.create({ data: { userId: user.id, clientId: client.id, subject, body, templateLabel: "Birthday Greeting" } });
              await tx.emailReminderSend.upsert({ where: { dedupeKey }, update: {}, create: { dedupeKey, clientId: client.id, type: "birthday", cycleKey, source: "auto", messageId } });
              await tx.client.update({ where: { id: client.id }, data: { lastBirthdayEmailAt: new Date(), lastContactedAt: new Date() } });
              await tx.auditLog.create({ data: { userId: user.id, action: "auto_send_birthday_greeting", entityType: "client", entityId: client.id, metadata: JSON.stringify({ cycleKey, messageId, timeZone: local.zone }) } });
            }));
        }
      }
    });
    for (const key of ["sent", "skipped", "failed", "review"] as const) total[key] += result[key];
  }
  return NextResponse.json({ ok: total.failed === 0 && total.review === 0, ...total });
}
