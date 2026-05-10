// components/dashboard/EmailPreviewDialog.tsx
// Shared compose dialog used by both UpcomingPremiums and UpcomingBirthdays.
"use client";

import { useEffect, useState } from "react";
import { Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useData } from "@/components/providers/DataProvider";
import { useSettings } from "@/components/providers/SettingsProvider";
import { getEmailService } from "@/lib/email-service";
import {
  plainTextToEmailHtml,
  renderEmailBody,
  renderEmailHtml,
} from "@/lib/templates";

export interface EmailPreviewPayload {
  /** Single client name | "Bulk" | label for header */
  contextLabel: string;
  to: string;
  /** comma-separated for bulk */
  bcc?: string;
  subject: string;
  body: string;
  /** Optional rich HTML body. Used for SMTP sends so Settings' HTML
   *  signature renders correctly in Gmail/Outlook. */
  html?: string;
  /** When provided, a successful direct-SMTP send appends an entry to
   *  this client's emailHistory (powers the Communication Log on the
   *  client detail page). Bulk sends (no single owning client) leave this
   *  undefined and skip the history write. */
  clientId?: string;
  /** Which template the dialog was opened with — drives the post-send
   *  side effects. "renewal" stamps the policy's lastRenewalEmailAt;
   *  "birthday" stamps the client's lastBirthdayEmailAt; "custom" only
   *  writes to the Communication Log + auto-note. */
  template?: "renewal" | "birthday" | "custom";
  /** Required when template === "renewal" — identifies the policy whose
   *  renewal-suppression timestamp should be stamped. */
  policyId?: string;
}

/** Result handed to onSent so callers can perform additional bookkeeping
 *  (e.g. clearing a selection). The dialog itself owns appending to
 *  emailHistory — callers just hear about the success. */
export interface EmailSentResult {
  via: "smtp" | "gmail" | "mailto";
  to: string;
  subject: string;
  body: string;
  clientId?: string;
}

interface EmailPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: EmailPreviewPayload | null;
  /** Called after the user clicks Send. Receives details of the send so
   *  callers can react (e.g. clear a selection). The component itself
   *  has already appended to emailHistory if applicable. */
  onSent?: (result: EmailSentResult) => void;
}

export function EmailPreviewDialog({
  open,
  onOpenChange,
  payload,
  onSent,
}: EmailPreviewDialogProps) {
  const {
    appendEmailHistory,
    markRenewalEmailSent,
    markBirthdayEmailSent,
    prependClientNote,
  } = useData();
  const { settings } = useSettings();

  // Local editable state, seeded from payload whenever the dialog opens.
  const [to, setTo] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open && payload) {
      setTo(payload.to);
      setBcc(payload.bcc ?? "");
      setSubject(payload.subject);
      setBody(payload.body);
      setSending(false);
    }
  }, [open, payload]);

  if (!payload) return null;

  const isBulk = !!payload.bcc;
  const recipientCount = isBulk
    ? bcc.split(",").map((s) => s.trim()).filter(Boolean).length
    : 1;
  const signatureHtml =
    settings.signature.enabled && settings.signature.html?.trim()
      ? settings.signature.html
      : settings.signature.enabled && settings.signature.text.trim()
      ? plainTextToEmailHtml(settings.signature.text)
      : "";

  /** Direct send via the /api/send-email route. The server reads
   *  SMTP_PASSWORD from env (never shipped to the browser) and relays
   *  through Gmail SMTP. On success we append to the client's
   *  Communication Log and close the dialog. */
  async function handleSendDirect() {
    setSending(true);
    const bccList = bcc.split(",").map((s) => s.trim()).filter(Boolean);
    const bodyWithSignature = renderEmailBody(body, {}, settings.signature);
    const htmlWithSignature = renderEmailHtml(body, {}, settings.signature);
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: to.trim(),
          bcc: bccList.length > 0 ? bccList : undefined,
          subject,
          body: bodyWithSignature,
          html: htmlWithSignature,
          clientId: payload?.clientId,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        messageId?: string;
      };
      if (!res.ok || !json.ok) {
        toast.error("Email failed to send", {
          description: json.error ?? `Server responded ${res.status}`,
        });
        return;
      }

      // === Post-success bookkeeping (runs in one render cycle) ===
      //
      // All side effects below mutate DataProvider state; React batches
      // them into a single re-render so the dashboard widgets shrink in
      // real time the moment the dialog closes — no manual refetch.
      const clientId = payload?.clientId;
      const template = payload?.template ?? "custom";

      // Friendly label used by both the Communication Log row and the
      // auto-note title. Two-tier mapping keeps the "Sent" suffix out of
      // the data model so we don't double up on it later.
      const templateLabel =
        template === "renewal"
          ? "Renewal Reminder"
          : template === "birthday"
          ? "Birthday Greeting"
          : "Custom";

      if (clientId) {
        // 1. Communication Log entry. Body is preserved verbatim for
        // future export, but the rendered list only shows
        // [icon · timestamp · "Sent <templateLabel> Email"].
        appendEmailHistory(clientId, { subject, body, templateLabel });

        // 2. Auto-note prepended to client.notes. Concise format per spec
        // — title + timestamp + subject only, no body preview.
        const stamp = new Date().toLocaleString("en-CA", {
          dateStyle: "short",
          timeStyle: "short",
        });
        const autoNote =
          `Action Log: ${templateLabel} Sent\n${stamp} — ${subject}`;
        prependClientNote(clientId, autoNote);
      }

      // 3. Stamp the suppression timestamp so the corresponding dashboard
      // widget hides this row for the suppression window. Renewal needs
      // a policyId; birthday is per-client.
      if (template === "renewal" && payload?.policyId) {
        markRenewalEmailSent(payload.policyId);
      }
      if (template === "birthday" && clientId) {
        markBirthdayEmailSent(clientId);
      }

      toast.success("Email sent successfully", {
        description: `Delivered to ${payload?.contextLabel ?? to}`,
      });
      onSent?.({
        via: "smtp",
        to: to.trim(),
        subject,
        body,
        clientId,
      });
      onOpenChange(false);
    } catch (e) {
      toast.error("Email failed to send", {
        description: (e as Error).message,
      });
    } finally {
      setSending(false);
    }
  }

  /** Fallback paths — open Gmail compose in a new tab, or fire a mailto:
   *  link. Used when the SMTP route is misconfigured / down or the user
   *  wants to send from a different account. These don't write to the
   *  Communication Log because we can't confirm whether the user
   *  ultimately clicked Send in the external compose window. */
  async function handleSendExternal(via: "gmail" | "mailto") {
    const result = await getEmailService(via).send({
      to: to.trim(),
      bcc: bcc.split(",").map((s) => s.trim()).filter(Boolean),
      subject,
      body: renderEmailBody(body, {}, settings.signature),
    });
    if (!result.ok) {
      toast.error(
        via === "gmail" ? "Could not open Gmail" : "Could not open email client",
        { description: result.error }
      );
      return;
    }
    toast.success(`Email draft prepared for ${payload?.contextLabel ?? "client"}`, {
      description:
        via === "gmail"
          ? "Gmail compose opened in a new tab. Review and click Send."
          : "Your default mail client opened with the draft.",
    });
    onSent?.({
      via,
      to: to.trim(),
      subject,
      body,
      clientId: payload?.clientId,
    });
    onOpenChange(false);
  }

  function recipientPills() {
    if (!isBulk) return null;
    const list = bcc
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {list.map((email, i) => (
          <span
            key={`${email}-${i}`}
            className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md"
          >
            {email}
            <button
              type="button"
              aria-label={`Remove ${email}`}
              className="hover:text-accent-red"
              onClick={() => {
                const next = list.filter((_, j) => j !== i).join(", ");
                setBcc(next);
              }}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Compose Email</DialogTitle>
          <DialogDescription>
            {isBulk
              ? `Bulk message — ${recipientCount} ${
                  recipientCount === 1 ? "recipient" : "recipients"
                } via Bcc`
              : `To ${payload.contextLabel}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email-to">To</Label>
            <Input
              id="email-to"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={isBulk ? "your@email.ca (or leave blank)" : ""}
            />
            {isBulk ? (
              <p className="text-[11px] text-triton-muted">
                Recipients are placed in <strong>Bcc</strong> for privacy.
              </p>
            ) : null}
          </div>

          {isBulk ? (
            <div className="space-y-1.5">
              <Label htmlFor="email-bcc">Bcc</Label>
              <Input
                id="email-bcc"
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                placeholder="comma-separated emails"
              />
              {recipientPills()}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email-body">Message</Label>
            <Textarea
              id="email-body"
              rows={8}
              className="resize-none"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            {signatureHtml ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50">
                <div className="border-b border-slate-200 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Email Signature
                  </p>
                </div>
                <div
                  className="px-3 py-3 text-xs leading-relaxed text-slate-700 [&_a]:text-blue-600 [&_img]:max-h-20 [&_img]:max-w-full [&_img]:rounded-md"
                  dangerouslySetInnerHTML={{ __html: signatureHtml }}
                />
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Cancel
          </Button>
          {/* Fallback paths — visible but de-emphasised. Useful when SMTP
              isn't configured yet or the user wants to send from a different
              account / their OS default mail app. */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleSendExternal("mailto")}
            disabled={!subject.trim() || !body.trim() || sending}
            title="Open the OS default mail client with this draft"
            className="text-slate-500 hover:text-slate-700"
          >
            Mail Client
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSendExternal("gmail")}
            disabled={!subject.trim() || !body.trim() || sending}
            title="Open mail.google.com compose with this draft prefilled"
          >
            Open in Gmail
          </Button>
          {/* Primary action — direct SMTP send via /api/send-email. */}
          <Button
            className="bg-navy hover:bg-navy/90 text-white min-w-[140px]"
            onClick={handleSendDirect}
            disabled={
              !subject.trim() || !body.trim() || !to.trim() || sending
            }
            title="Send directly via Gmail SMTP"
          >
            {sending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Confirm &amp; Send
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
