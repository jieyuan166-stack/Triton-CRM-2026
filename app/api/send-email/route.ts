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
// A second route at /api/email/send (older path) does the same job for
// internal callers that already wired against it. Both share the same env
// helpers in `lib/env.server.ts`. When the Step-10 server-action layer
// lands we'll consolidate to one path.

import "server-only";
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

// Spec payload: { to, subject, body, clientId? }. clientId is optional and
// passed through for round-trip identification by the client; the server
// doesn't persist it (the in-memory Communication Log is updated on the
// client side after this route returns ok).
const sendSchema = z.object({
  to: z.union([z.string().email(), z.array(z.string().email())]),
  cc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  bcc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
  html: z.string().optional(),
  clientId: z.string().optional(),
  fromName: z.string().optional(),
  fromEmail: z.string().email().optional(),
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function plainTextToHtml(text: string): string {
  return `<div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #0F172A;">${escapeHtml(
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

  // Fetch the App Password lazily so a missing config surfaces as a clean
  // 503 rather than a stack trace at module load.
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
    secure: emailDefaults.secure, // 465 → implicit TLS
    auth: {
      user: emailDefaults.user,
      pass: password,
    },
  });

  const fromName = data.fromName ?? emailDefaults.fromName;
  const fromEmail =
    data.fromEmail ?? emailDefaults.fromEmail ?? emailDefaults.user;
  const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

  try {
    const fullHtml = data.html?.trim() ? sanitizeEmailHtml(data.html) : plainTextToHtml(data.body);
    const { html: htmlWithCids, attachments } = attachInlineImages(fullHtml);
    const info = await transporter.sendMail({
      from,
      to: data.to,
      cc: data.cc,
      bcc: data.bcc,
      subject: data.subject,
      text: data.body,
      html: htmlWithCids,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
    await auditLog({
      action: "send_email",
      entityType: data.clientId ? "client" : undefined,
      entityId: data.clientId,
      metadata: { subject: data.subject },
    });
    return NextResponse.json({
      ok: true,
      messageId: info.messageId,
      clientId: data.clientId ?? null,
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Send failed";
     
    console.error("[send-email] transport error:", error);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
