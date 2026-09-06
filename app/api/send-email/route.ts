// app/api/send-email/route.ts
//
// POST /api/send-email — direct Gmail SMTP send via nodemailer.
//
// This route is the spec-aligned entry point for the Communication Log
// feature: the EmailPreviewDialog "Confirm & Send" button POSTs here, and
// the route handler relays the message through Gmail's SMTP server using
// the App Password held in `SMTP_PASSWORD` (env-only — never reaches the
// browser).
//
// Trust boundary: nodemailer is a server-only module. The route uses
// `import "server-only";` to make sure it can never be pulled into a
// client component by mistake — Next.js will fail the build instead of
// shipping the SMTP credentials to the browser.
//
// The older /api/email/send path is now a 308 compatibility redirect to this route.

import "server-only";
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { z } from "zod";
import { emailDefaults } from "@/lib/env.server";
import { requireSession, unauthorized } from "@/lib/api-security";
import { db } from "@/lib/db";
import { buildDefaultSettingsForUser, mergeAppSettings } from "@/lib/default-settings";
import { deliverOnce } from "@/lib/email-delivery";
import { resolveEmailContext, sendContextSchema } from "@/lib/email-send-context";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { sanitizeEmailHtml } from "@/lib/security/sanitize-html";
import { attachInlineImages } from "@/lib/email-inline-images";
import { resolveSmtpAccount } from "@/lib/smtp-account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// clientId/context are resolved again on the server. Successful sends and
// their business log are committed together; the browser never supplies
// trusted ownership or SMTP account information.
const sendSchema = z.object({
  requestId: z.string().uuid(),
  context: sendContextSchema.optional(),
  to: z.union([z.string().email(), z.array(z.string().email())]),
  cc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  bcc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
  html: z.string().optional(),
  signatureHtml: z.string().optional(),
  clientId: z.string().optional(),
  fromName: z.string().optional(),
  fromEmail: z.string().email().optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string().min(1),
        contentType: z.string().min(1).optional(),
        content: z.string().min(1),
      })
    )
    .max(10)
    .optional(),
});

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function plainTextToHtml(text: string): string {
  return `<div style="font-family: Geist, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, sans-serif; font-size: 14px; line-height: 1.6; color: #0F172A;">${escapeHtml(
    text
  )
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n/g, "<br />")}</div>`;
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const limited = rateLimit(`send-email:${session.user.id}:${getClientIp(request)}`, {
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (!limited.ok) {
    return NextResponse.json({ ok: false, error: "Too many emails sent recently" }, { status: 429 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = sendSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Validation failed",
        issues: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }
  const data = parsed.data;

  const user = await db.user.findUniqueOrThrow({ where: { id: session.user.id } });
  const defaults = buildDefaultSettingsForUser(user);
  const settingsRow = await db.settings.findUnique({ where: { userId: user.id } });
  const settings = settingsRow ? mergeAppSettings(JSON.parse(settingsRow.data), defaults) : defaults;
  const fromEmail = settings.email.fromEmail || user.email;
  const from = { name: settings.email.fromName || user.name, address: fromEmail };
  const context = data.context;
  let resolved;
  try {
    resolved = await resolveEmailContext(user.id, data.clientId, context ?? sendContextSchema.parse({ body: data.body, saveToActivity: false }));
  } catch { return NextResponse.json({ ok: false, error: "Email context not found" }, { status: 404 }); }
  const reminder = resolved.reminder;
  if (reminder && !context?.resend && await db.emailReminderSend.findUnique({ where: { dedupeKey: reminder.dedupeKey } })) {
    return NextResponse.json({ ok: false, error: "This reminder is already completed. Use Re-send from Completed to send another copy." }, { status: 409 });
  }

  // Fetch the App Password lazily so a missing config surfaces as a clean
  // 503 rather than a stack trace at module load.
  let smtpAccount: ReturnType<typeof resolveSmtpAccount>;
  try {
    smtpAccount = resolveSmtpAccount({
      user: settings.email.user || user.email,
      fromEmail,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          "SMTP is not configured for this account. Check Email settings.",
      },
      { status: 503 }
    );
  }

  const transporter = nodemailer.createTransport({
    host: settings.email.host || emailDefaults.host,
    port: settings.email.port || emailDefaults.port,
    secure: settings.email.secure ?? emailDefaults.secure,
    connectionTimeout: 30_000, greetingTimeout: 30_000, socketTimeout: 60_000,
    auth: {
      user: smtpAccount.user,
      pass: smtpAccount.password,
    },
  });

  try {
    const bodyHtml = data.html?.trim() ? sanitizeEmailHtml(data.html) : plainTextToHtml(data.body);
    const signatureHtml = data.signatureHtml?.trim()
      ? sanitizeEmailHtml(data.signatureHtml)
      : "";
    const fullHtml = signatureHtml
      ? `${bodyHtml}<br /><br />${signatureHtml}`
      : bodyHtml;
    const { html: htmlWithCids, attachments } = attachInlineImages(fullHtml);
    const userAttachments = (data.attachments ?? []).map((attachment) => {
      const content = Buffer.from(attachment.content, "base64");
      return {
        filename: attachment.filename.replace(/[\\/:*?"<>|]/g, "-"),
        contentType: attachment.contentType ?? "application/octet-stream",
        content,
      };
    });
    const totalAttachmentBytes = [...attachments, ...userAttachments].reduce(
      (sum, attachment) => sum + attachment.content.length,
      0
    );
    if (totalAttachmentBytes > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Attachments exceed the 20MB limit" },
        { status: 413 }
      );
    }
    const allAttachments = [...attachments, ...userAttachments];
    const result = await deliverOnce({
      userId: user.id, clientId: data.clientId, policyId: reminder?.policyId,
      dedupeKey: reminder && !context?.resend ? reminder.dedupeKey : `manual:${user.id}:${data.requestId}`,
      type: reminder?.type ?? "manual-email", cycleKey: reminder?.cycleKey ?? data.requestId, stage: reminder?.stage,
    }, () => transporter.sendMail({
      from,
      to: data.to,
      cc: data.cc,
      bcc: data.bcc,
      subject: data.subject,
      text: data.body,
      html: htmlWithCids,
      attachments: allAttachments.length > 0 ? allAttachments : undefined,
    }), async (tx, messageId) => {
      if (context && data.clientId && context.saveToActivity && context.template !== "festival") {
        const label = context.template === "renewal" ? `Renewal Reminder${reminder?.stage ? ` · ${reminder.stage === "first" ? "First" : "Second"} Reminder` : ""}`
          : context.template === "birthday" ? "Birthday Greeting" : context.communicationType || "External Email";
        await tx.emailHistory.create({ data: { userId: user.id, clientId: data.clientId, subject: data.subject, body: context.body,
          templateLabel: label, communicationType: label, ...resolved.contexts[0],
          policyContexts: JSON.stringify(resolved.contexts), attachments: JSON.stringify(context.attachments) } });
        await tx.client.update({ where: { id: data.clientId }, data: { lastContactedAt: new Date() } });
      }
      // A manual re-send is a new delivery event, not a replacement for the
      // original completed reminder. Keep the canonical stage timestamp and
      // message id intact so Completed remains an auditable first send.
      if (reminder && !context?.resend) {
        const { dedupeKey, ...fields } = reminder;
        await tx.emailReminderSend.upsert({ where: { dedupeKey }, create: { dedupeKey, ...fields, source: "manual", messageId },
          update: { source: "manual", sentAt: new Date(), seenAt: null, messageId } });
        if (reminder.policyId) await tx.policy.update({ where: { id: reminder.policyId }, data: { lastRenewalEmailAt: new Date() } });
        if (reminder.type === "birthday") await tx.client.update({ where: { id: reminder.clientId }, data: { lastBirthdayEmailAt: new Date() } });
      }
      if (context?.draftEntryId) await tx.emailHistory.deleteMany({ where: { id: context.draftEntryId, client: { userId: user.id }, templateLabel: { startsWith: "Email Draft" } } });
      await tx.auditLog.create({ data: { userId: user.id, action: "send_email", entityType: "client", entityId: data.clientId,
        metadata: JSON.stringify({ messageId, manualResend: context?.resend ?? false }) } });
    });
    if (result.status !== "sent" && !(result.status === "skipped" && result.messageId)) {
      return NextResponse.json({ ok: false, error: result.reason || "Delivery needs review; check your mailbox Sent folder before retrying.", status: result.status }, { status: result.status === "failed" ? 502 : 409 });
    }
    return NextResponse.json({
      ok: true,
      messageId: result.messageId,
      clientId: data.clientId ?? null,
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Send failed";
     
    console.error("[send-email] transport error:", error);
    return NextResponse.json({ ok: false, error: "Email could not be confirmed. Check Sent before retrying." }, { status: 500 });
  }
}
