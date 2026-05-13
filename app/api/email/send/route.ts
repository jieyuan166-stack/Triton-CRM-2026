// app/api/email/send/route.ts
// POST /api/email/send → relay email via Gmail SMTP using nodemailer.
//
// Trust boundary: SMTP_PASSWORD never leaves the server. Browser only sees
// `{ ok, messageId? }` or `{ ok: false, error }`. The body is validated with
// Zod before being passed to nodemailer.
//
// Step 10 will gate this behind the auth middleware so only signed-in admins
// can trigger sends. For now any client can hit it — fine for local dev.

import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { z } from "zod";
import { emailDefaults, serverEnv } from "@/lib/env.server";
import { auditLog, requireSession, unauthorized } from "@/lib/api-security";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { sanitizeEmailHtml } from "@/lib/security/sanitize-html";
import { attachInlineImages } from "@/lib/email-inline-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sendSchema = z.object({
  to: z
    .union([z.string().email(), z.array(z.string().email())])
    .optional(),
  cc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  bcc: z
    .union([z.string().email(), z.array(z.string().email())])
    .optional(),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
  html: z.string().optional(),
  fromName: z.string().optional(),
  fromEmail: z.string().email().optional(),
  signatureHtml: z.string().optional(),
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

function toRecipientList(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string") return [v];
  return [];
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const limited = rateLimit(`email-send:${session.user.id}:${getClientIp(request)}`, {
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
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = sendSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const data = parsed.data;

  // At least one recipient is required across to/cc/bcc.
  const allRecipients = [
    ...toRecipientList(data.to),
    ...toRecipientList(data.cc),
    ...toRecipientList(data.bcc),
  ];
  if (allRecipients.length === 0) {
    return NextResponse.json(
      { ok: false, error: "At least one recipient is required" },
      { status: 400 }
    );
  }

  // Read SMTP password lazily — throws if not configured, which we surface
  // as a friendly client error.
  let password: string;
  try {
    password = serverEnv.getSmtpPassword();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          "SMTP_PASSWORD is not configured on the server. Add it to .env.local.",
      },
      { status: 503 }
    );
  }

  const transporter = nodemailer.createTransport({
    host: emailDefaults.host,
    port: emailDefaults.port,
    secure: emailDefaults.secure, // true for 465 (Implicit SSL/TLS)
    auth: {
      user: emailDefaults.user,
      pass: password,
    },
  });

  const fromName = data.fromName ?? emailDefaults.fromName;
  const fromEmail = data.fromEmail ?? emailDefaults.fromEmail ?? emailDefaults.user;
  const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

  try {
    // payload.html already includes the signature via renderEmailHtml.
    // Use it directly if available; otherwise wrap body and optionally append signature.
    const fullHtml = data.html
      ? data.html
      : data.signatureHtml
      ? `<div style="font-family:Geist,-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,sans-serif;font-size:14px;color:#0F172A;line-height:1.6;">${data.body.replace(/\n/g, "<br/>")}</div><div style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:16px;">${data.signatureHtml}</div>`
      : `<div style="font-family:Geist,-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,sans-serif;font-size:14px;color:#0F172A;line-height:1.6;">${data.body.replace(/\n/g, "<br/>")}</div>`;
    const { html: htmlWithCids, attachments } = attachInlineImages(sanitizeEmailHtml(fullHtml));
    const userAttachments = (data.attachments ?? []).map((attachment) => {
      const content = Buffer.from(attachment.content, "base64");
      return {
        filename: attachment.filename.replace(/[\\/:*?"<>|]/g, "-"),
        contentType: attachment.contentType ?? "application/octet-stream",
        content,
      };
    });
    const totalAttachmentBytes = userAttachments.reduce(
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
    const info = await transporter.sendMail({
      from,
      to: data.to,
      cc: data.cc,
      bcc: data.bcc,
      subject: data.subject,
      text: data.body,
      html: htmlWithCids,
      attachments: allAttachments.length > 0 ? allAttachments : undefined,
    });
    await auditLog({
      action: "send_email",
      entityType: "client",
      metadata: { subject: data.subject },
    });
    return NextResponse.json({ ok: true, messageId: info.messageId });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Send failed";
     
    console.error("[email/send] transport error:", error);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
