import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, unauthorized } from "@/lib/api-security";
import { db } from "@/lib/db";
import { readWeeklyDigestSettings, isWeeklyDigestDue } from "@/lib/weekly-digest";
import { localCalendar } from "@/lib/automation-calendar";
import { formatDate } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/format";
import { premiumReminderEmailStageLabel } from "@/lib/premium-reminders";
import { applyTemplate } from "@/lib/templates";

export const dynamic = "force-dynamic";

const reviewResolutionSchema = z.object({
  taskId: z.string().min(1),
  resolution: z.enum(["retry", "confirm-sent"]),
});

function isReviewableTask(task: { status: string; startedAt: Date }) {
  return (
    task.status === "review" ||
    (task.status === "sending" && Date.now() - task.startedAt.getTime() > 10 * 60_000)
  );
}

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();
  try {
    const userId = session.user.id;
    const [runs, tasks, settings, followUpReminderCount] = await Promise.all([
      db.automationRun.findMany({ where: { userId } }),
      db.emailDeliveryTask.findMany({ where: { userId }, orderBy: { startedAt: "desc" }, take: 100 }),
      readWeeklyDigestSettings(userId),
      db.followUp.count({
        where: {
          client: { userId },
          completedAt: null,
          deadline: { not: null },
          reminderLeadDays: { not: null },
        },
      }),
    ]);
    const [clients, policies] = await Promise.all([
      db.client.findMany({ where: { userId, id: { in: tasks.flatMap((task) => task.clientId ? [task.clientId] : []) } }, select: { id: true, slug: true, firstName: true, lastName: true, companyName: true } }),
      db.policy.findMany({ where: { userId, id: { in: tasks.flatMap((task) => task.policyId ? [task.policyId] : []) } }, select: { id: true, policyNumber: true, carrier: true, productName: true, productType: true } }),
    ]);
    const now = Date.now();
    const nextCheck = new Date((Math.floor(now / 900_000) + 1) * 900_000);
    let nextDigest: string | null = null;
    let nextBackup: string | null = null;
    for (let minute = 0; minute <= 8 * 24 * 60; minute += 15) {
      const date = new Date(nextCheck.getTime() + minute * 60_000);
      const local = localCalendar(date);
      const digestAlreadySent = tasks.some((task) => task.type === "weekly-digest" && task.status === "sent" && task.cycleKey.startsWith(local.date));
      if (!nextDigest && !digestAlreadySent && isWeeklyDigestDue(settings, date)) nextDigest = date.toISOString();
      if (!nextBackup && local.weekday === "sunday" && local.minutes === 120) nextBackup = date.toISOString();
      if (nextDigest && nextBackup) break;
    }
    return NextResponse.json({ runs, nextCheck: nextCheck.toISOString(), nextDigest, nextBackup,
      premiumEnabled: settings.emailAutomation.premiumRemindersEnabled,
      birthdayEnabled: settings.emailAutomation.birthdayGreetingsEnabled,
      digestEnabled: settings.weeklyDigest.enabled,
      followUpReminderCount,
      backupEnabled: session.user.role !== "admin",
      tasks: tasks.map((task) => {
        const client = clients.find((item) => item.id === task.clientId);
        const policy = policies.find((item) => item.id === task.policyId);
        return { id: task.id, dedupeKey: task.dedupeKey, type: task.type, stage: task.stage, status: task.status === "sending" && now - task.startedAt.getTime() > 10 * 60_000 ? "review" : task.status,
          startedAt: task.startedAt, finishedAt: task.finishedAt, errorCode: task.errorCode,
          clientName: client ? client.companyName || `${client.firstName} ${client.lastName}` : null,
          clientHref: client ? `/clients/${client.slug || client.id}#activity` : null,
          policyNumber: policy?.policyNumber ?? null,
          policyLabel: policy ? `${policy.carrier} ${policy.productName || policy.productType}` : null,
          canResolve: (task.type === "premium" || task.type === "birthday") && isReviewableTask(task),
        };
      }),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Unable to load automation status" }, { status: 500 }); }
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const parsed = reviewResolutionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid review action" }, { status: 400 });
  }

  const userId = session.user.id;
  const task = await db.emailDeliveryTask.findFirst({
    where: { id: parsed.data.taskId, userId },
  });
  if (!task) return NextResponse.json({ ok: false, error: "Delivery task not found" }, { status: 404 });
  if (!isReviewableTask(task)) {
    return NextResponse.json({ ok: false, error: "This delivery no longer needs review" }, { status: 409 });
  }
  if (task.type !== "premium" && task.type !== "birthday") {
    return NextResponse.json({ ok: false, error: "This delivery must be reviewed by an administrator" }, { status: 400 });
  }

  if (parsed.data.resolution === "retry") {
    await db.$transaction(async (tx) => {
      await tx.emailReminderSend.deleteMany({
        where: { dedupeKey: task.dedupeKey, client: { userId }, source: "dismissed" },
      });
      await tx.emailDeliveryTask.update({
        where: { id: task.id },
        data: {
          status: "failed",
          errorCode: "RETRY_APPROVED",
          // deliverOnce retries failed claims after 15 minutes. Backdating the
          // claim makes the next scheduled run eligible immediately.
          startedAt: new Date(Date.now() - 16 * 60_000),
          finishedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "approve_email_delivery_retry",
          entityType: task.type,
          entityId: task.policyId || task.clientId || task.id,
          metadata: JSON.stringify({ taskId: task.id, dedupeKey: task.dedupeKey }),
        },
      });
    });
    return NextResponse.json({ ok: true, resolution: "retry" });
  }

  if (!task.clientId) {
    return NextResponse.json({ ok: false, error: "Client context is missing" }, { status: 409 });
  }
  const [client, settings] = await Promise.all([
    db.client.findFirst({ where: { id: task.clientId, userId } }),
    readWeeklyDigestSettings(userId),
  ]);
  if (!client) return NextResponse.json({ ok: false, error: "Client context was not found" }, { status: 404 });

  const clientName = client.companyName || `${client.firstName} ${client.lastName}`.trim();
  let subject = "Customer email delivery confirmed";
  let body = "This delivery was confirmed manually after checking the advisor's Sent mailbox.";
  let policyContext: { policyId?: string; policyNumber?: string; policyLabel?: string } = {};
  let templateLabel = task.type === "birthday" ? "Birthday Greeting" : "Renewal Reminder";

  if (task.type === "premium") {
    const policy = task.policyId
      ? await db.policy.findFirst({ where: { id: task.policyId, userId } })
      : null;
    if (!policy || (task.stage !== "first" && task.stage !== "second")) {
      return NextResponse.json({ ok: false, error: "Premium reminder context is incomplete" }, { status: 409 });
    }
    const renewalTemplate = settings.templates.find((item) => item.id === "renewal");
    if (!renewalTemplate) return NextResponse.json({ ok: false, error: "Renewal template is missing" }, { status: 409 });
    const dueDate = task.cycleKey.slice(task.cycleKey.lastIndexOf(":") + 1);
    const stageLabel = premiumReminderEmailStageLabel(task.stage);
    const premium = formatCurrency(policy.premium);
    const coverage = formatCurrency(policy.sumAssured);
    const date = formatDate(dueDate);
    const vars = {
      "Client Name": clientName,
      Carrier: policy.carrier,
      "Policy Name": policy.productName || policy.productType,
      "Policy Number": policy.policyNumber,
      "Total Coverage": coverage,
      "Death Benefit": coverage,
      "Face Amount": coverage,
      "Premium Amount": premium,
      Date: date,
      "Reminder Stage": stageLabel,
    };
    subject = applyTemplate(renewalTemplate.subject, vars);
    body = applyTemplate(renewalTemplate.body, vars);
    if (!subject.includes(stageLabel)) subject = `${stageLabel} · ${subject}`;
    if (!body.includes(stageLabel)) body = `${stageLabel}\n\n${body}`;
    policyContext = {
      policyId: policy.id,
      policyNumber: policy.policyNumber,
      policyLabel: `${policy.carrier} ${policy.productName || policy.productType}`,
    };
    templateLabel = `Renewal Reminder · ${stageLabel} · ${policy.carrier} · #${policy.policyNumber}`;
  } else {
    const birthdayTemplate = settings.templates.find((item) => item.id === "birthday");
    if (birthdayTemplate) {
      subject = applyTemplate(birthdayTemplate.subject, { "Client Name": clientName });
      body = applyTemplate(birthdayTemplate.body, { "Client Name": clientName });
    }
  }

  await db.$transaction(async (tx) => {
    await tx.emailReminderSend.upsert({
      where: { dedupeKey: task.dedupeKey },
      create: {
        dedupeKey: task.dedupeKey,
        policyId: task.policyId,
        clientId: client.id,
        type: task.type,
        stage: task.stage,
        cycleKey: task.cycleKey,
        source: "manual",
        messageId: task.messageId,
      },
      update: {
        source: "manual",
        sentAt: new Date(),
        seenAt: null,
        messageId: task.messageId,
      },
    });
    await tx.emailHistory.create({
      data: {
        userId,
        clientId: client.id,
        subject,
        body,
        templateLabel,
        communicationType: task.type === "premium" ? "Renewal Reminder" : "Birthday Greeting",
        ...policyContext,
        policyContexts: policyContext.policyId ? JSON.stringify([policyContext]) : undefined,
        attachments: JSON.stringify([]),
      },
    });
    await tx.emailDeliveryTask.update({
      where: { id: task.id },
      data: { status: "sent", errorCode: "USER_CONFIRMED_SENT", finishedAt: new Date() },
    });
    await tx.client.update({
      where: { id: client.id },
      data: {
        lastContactedAt: new Date(),
        ...(task.type === "birthday" ? { lastBirthdayEmailAt: new Date() } : {}),
      },
    });
    if (task.policyId) {
      await tx.policy.update({ where: { id: task.policyId }, data: { lastRenewalEmailAt: new Date() } });
    }
    await tx.auditLog.create({
      data: {
        userId,
        action: "confirm_email_delivery_from_sent_mailbox",
        entityType: task.type,
        entityId: task.policyId || client.id,
        metadata: JSON.stringify({ taskId: task.id, dedupeKey: task.dedupeKey }),
      },
    });
  }, { timeout: 20_000 });

  return NextResponse.json({ ok: true, resolution: "confirm-sent" });
}
