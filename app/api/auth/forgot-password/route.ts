import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { z } from "zod";

import { db } from "@/lib/db";
import { emailDefaults, serverEnv } from "@/lib/env.server";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ email: z.string().email() });

function generateTempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export async function POST(request: Request) {
  const limited = rateLimit(`forgot:${getClientIp(request)}`, {
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (!limited.ok) {
    return NextResponse.json({ ok: true });
  }

  const payload = await request.json().catch(() => null);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ok: true });
  }

  const email = parsed.data.email.toLowerCase();
  const recoveryEmail = (emailDefaults.fromEmail || emailDefaults.user || "").toLowerCase();
  const user =
    (await db.user.findUnique({ where: { email } })) ??
    (email === recoveryEmail
      ? await db.user.findFirst({
          where: { role: "admin" },
          orderBy: { createdAt: "asc" },
        })
      : null);
  if (!user) {
    return NextResponse.json({ ok: true });
  }

  let password: string;
  try {
    password = serverEnv.getSmtpPassword();
  } catch {
    return NextResponse.json({ ok: false, error: "SMTP is not configured" }, { status: 503 });
  }

  const tempPassword = generateTempPassword();
  const nextPasswordHash = await bcrypt.hash(tempPassword, 12);

  const transporter = nodemailer.createTransport({
    host: emailDefaults.host,
    port: emailDefaults.port,
    secure: emailDefaults.secure,
    auth: { user: emailDefaults.user, pass: password },
  });
  const fromEmail = emailDefaults.fromEmail || emailDefaults.user;
  const userEmail = user.email.toLowerCase();
  const shouldUseRecoveryEmail =
    !!recoveryEmail &&
    (email === recoveryEmail || userEmail.endsWith("@triton.ca") || userEmail.endsWith("@tritonwealth.ca"));
  const resetRecipient = shouldUseRecoveryEmail ? recoveryEmail : user.email;
  const html = [
    "<div style=\"font-family:Geist,-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,sans-serif;font-size:14px;color:#0f172a;line-height:1.6;\">",
    "<p>A password reset was requested for your Triton CRM account.</p>",
    "<p>Your temporary password is:</p>",
    `<p style=\"font-family:Geist Mono,SFMono-Regular,Menlo,Consolas,monospace;font-size:20px;font-weight:700;letter-spacing:0.04em;color:#002147;\">${tempPassword}</p>`,
    "<p>Sign in with this temporary password, then change it immediately from <strong>Settings &gt; Account Security</strong>.</p>",
    "<p>If you did not request this reset, sign in and change your password right away.</p>",
    "</div>",
  ].join("");

  await transporter.sendMail({
    from: emailDefaults.fromName ? `${emailDefaults.fromName} <${fromEmail}>` : fromEmail,
    to: resetRecipient,
    subject: "Triton CRM Temporary Password",
    text: [
      "A password reset was requested for your Triton CRM account.",
      "",
      `Temporary password: ${tempPassword}`,
      "",
      "Sign in and change this password immediately from Settings > Account Security.",
    ].join("\n"),
    html,
  });

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: nextPasswordHash },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "forgot_password_temp_sent",
      entityType: "user",
      entityId: user.id,
      metadata: JSON.stringify({ requestedEmail: email, sentTo: resetRecipient }),
    },
  });

  return NextResponse.json({ ok: true });
}
