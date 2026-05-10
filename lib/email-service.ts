// lib/email-service.ts
// Independent email sending service.
//
// Design:
//   - The interface `EmailService` is what callers (UI, server actions) depend on.
//   - Two implementations:
//       1. MailtoEmailService — current default; opens the user's local mail
//          client. Runs in the browser. No secrets needed.
//       2. SmtpEmailService — server-side, reads SMTP_PASSWORD from env via
//          serverEnv.getSmtpPassword(). Stub today; will use nodemailer once
//          we add the server-action layer in Step 10/11.
//   - `getEmailService()` returns the current implementation. Switching
//     backends is a one-line change.

import type { EmailConfig } from "./settings-types";

// === Public types ===

export interface SendEmailRequest {
  to: string | string[];
  bcc?: string | string[];
  cc?: string | string[];
  subject: string;
  body: string;
  /** Optional override; if absent, falls back to config.fromName / fromEmail */
  fromName?: string;
  fromEmail?: string;
}

export interface SendEmailResult {
  ok: boolean;
  /** mailto: URI for client-side flows; transport message id for SMTP. */
  reference?: string;
  error?: string;
}

export interface EmailService {
  readonly kind: "mailto" | "smtp" | "gmail";
  send(req: SendEmailRequest): Promise<SendEmailResult>;
}

// === Helpers ===

function toList(v?: string | string[]): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v.filter(Boolean) : [v].filter(Boolean);
}

// === MailtoEmailService — runs in the browser ===

export class MailtoEmailService implements EmailService {
  readonly kind = "mailto" as const;

  async send(req: SendEmailRequest): Promise<SendEmailResult> {
    const to = toList(req.to).join(",");
    const params = new URLSearchParams();

    const cc = toList(req.cc);
    if (cc.length) params.set("cc", cc.join(","));

    const bcc = toList(req.bcc);
    if (bcc.length) params.set("bcc", bcc.join(","));

    if (req.subject) params.set("subject", req.subject);
    if (req.body) params.set("body", req.body);

    const qs = params.toString().replace(/\+/g, "%20");
    const href = `mailto:${encodeURIComponent(to)}${qs ? `?${qs}` : ""}`;

    if (typeof window === "undefined") {
      return { ok: false, error: "MailtoEmailService requires a browser." };
    }
    window.location.href = href;
    return { ok: true, reference: href };
  }
}

// === SmtpEmailService — relays through /api/email/send ===
// The browser never sees SMTP credentials; the server action reads
// SMTP_PASSWORD from the env at the moment of sending.

export class SmtpEmailService implements EmailService {
  readonly kind = "smtp" as const;
  constructor(private readonly config?: EmailConfig) {}

  async send(req: SendEmailRequest): Promise<SendEmailResult> {
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: req.to,
          cc: req.cc,
          bcc: req.bcc,
          subject: req.subject,
          body: req.body,
          fromName: req.fromName ?? this.config?.fromName,
          fromEmail: req.fromEmail ?? this.config?.fromEmail,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        messageId?: string;
        error?: string;
      };

      if (!res.ok || !json.ok) {
        return { ok: false, error: json.error ?? `Send failed (${res.status})` };
      }
      return { ok: true, reference: json.messageId };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}

// === GmailComposeService — opens Gmail's web-compose window ===
//
// Builds a deep link of the form
//   https://mail.google.com/mail/?view=cm&fs=1&to=…&su=…&body=…&bcc=…
// and opens it in a new tab. Gmail prefills the compose window with the
// supplied fields and the user clicks Send themselves — so this is a
// "draft" path, not a true machine-sends-it path. It's the most useful
// stop-gap until SMTP/Resend wiring lands (see the TODO at the bottom of
// this file).
//
// Why a separate service vs reusing MailtoEmailService:
//   - mailto: opens whatever the OS thinks is the default mail handler
//     (Apple Mail, Outlook, Thunderbird, …). Most of our users actually
//     use Gmail in the browser, so this is what they want.
//   - Gmail's compose URL accepts to/cc/bcc/su/body via query string — no
//     auth required, the user is already logged into the tab.

export class GmailComposeService implements EmailService {
  readonly kind = "gmail" as const;

  async send(req: SendEmailRequest): Promise<SendEmailResult> {
    if (typeof window === "undefined") {
      return { ok: false, error: "GmailComposeService requires a browser." };
    }
    const params = new URLSearchParams();
    params.set("view", "cm");
    params.set("fs", "1");
    const to = toList(req.to).join(",");
    const cc = toList(req.cc).join(",");
    const bcc = toList(req.bcc).join(",");
    if (to) params.set("to", to);
    if (cc) params.set("cc", cc);
    if (bcc) params.set("bcc", bcc);
    if (req.subject) params.set("su", req.subject);
    if (req.body) params.set("body", req.body);

    // URLSearchParams encodes spaces as "+" by default; Gmail handles that
    // fine in `body`, but using %20 reads better in the address bar and
    // matches mailto: encoding from MailtoEmailService.
    const qs = params.toString().replace(/\+/g, "%20");
    const href = `https://mail.google.com/mail/?${qs}`;
    const win = window.open(href, "_blank", "noopener,noreferrer");
    if (!win) {
      // Pop-up blocker. Fall back to navigating the current tab.
      window.location.href = href;
    }
    return { ok: true, reference: href };
  }
}

// === Factory ===
//
// TODO(post-step-10): swap MailtoEmailService for SmtpEmailService once the
// server-action layer lands; or wire in a Resend client (RESEND_API_KEY in
// .env.local). For now the dialog defaults to Gmail (the common case for
// this user) with a Mail Client fallback.

export type EmailServiceKind = "mailto" | "smtp" | "gmail";

let cached: EmailService | null = null;

export function getEmailService(
  kind: EmailServiceKind = "mailto",
  config?: EmailConfig
): EmailService {
  if (cached && cached.kind === kind) return cached;

  if (kind === "smtp") {
    // Config is optional: the SMTP server-side route already pulls host/port/
    // user from env. Passing a config just lets the caller override the
    // From: header per email.
    cached = new SmtpEmailService(config);
  } else if (kind === "gmail") {
    cached = new GmailComposeService();
  } else {
    cached = new MailtoEmailService();
  }
  return cached;
}

/** Reset the cached instance — useful when the user updates settings. */
export function resetEmailService(): void {
  cached = null;
}
