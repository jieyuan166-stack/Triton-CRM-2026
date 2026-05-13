// components/dashboard/EmailPreviewDialog.tsx
// Shared compose dialog used by both UpcomingPremiums and UpcomingBirthdays.
"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, ImageIcon, Loader2, Paperclip, Send, Trash2, X } from "lucide-react";
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
import type { EmailTemplateAttachment } from "@/lib/settings-types";
import {
  plainTextToEmailHtml,
  renderEmailBody,
  renderEmailHtml,
} from "@/lib/templates";

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

interface ComposeAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  content: string;
}

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
  /** Bulk sends must be individualized. Each item is sent as its own SMTP
   *  message so template variables resolve per client/policy instead of
   *  leaking into one generic Bcc email. */
  batch?: EmailPreviewBatchItem[];
  /** Which template the dialog was opened with — drives the post-send
   *  side effects. "renewal" stamps the policy's lastRenewalEmailAt;
   *  "birthday" stamps the client's lastBirthdayEmailAt; "custom" only
   *  writes to the Communication Log + auto-note. */
  template?: "renewal" | "birthday" | "custom";
  /** Required when template === "renewal" — identifies the policy whose
   *  renewal-suppression timestamp should be stamped. */
  policyId?: string;
  attachments?: EmailTemplateAttachment[];
}

export interface EmailPreviewBatchItem {
  contextLabel: string;
  to: string;
  subject: string;
  body: string;
  html?: string;
  clientId?: string;
  template?: "renewal" | "birthday" | "custom";
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
  const [attachments, setAttachments] = useState<ComposeAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open && payload) {
      setTo(payload.to);
      setBcc(payload.bcc ?? "");
      setSubject(payload.subject);
      setBody(payload.body);
      setAttachments(payload.attachments ?? []);
      setSending(false);
    }
  }, [open, payload]);

  if (!payload) return null;

  const batch = payload.batch ?? [];
  const isBatch = batch.length > 0;
  const isBulk = isBatch || !!payload.bcc;
  const recipientCount = isBatch
    ? batch.length
    : isBulk
    ? bcc.split(",").map((s) => s.trim()).filter(Boolean).length
    : 1;
  const signatureHtml =
    settings.signature.enabled && settings.signature.html?.trim()
      ? settings.signature.html
      : settings.signature.enabled && settings.signature.text.trim()
      ? plainTextToEmailHtml(settings.signature.text)
      : "";

  const totalAttachmentBytes = attachments.reduce((sum, file) => sum + file.size, 0);

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function arrayBufferToBase64(buffer: ArrayBuffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return window.btoa(binary);
  }

  async function handleAttachmentChange(files: FileList | null) {
    if (!files || files.length === 0) return;

    const nextFiles = Array.from(files);
    const nextTotal =
      totalAttachmentBytes + nextFiles.reduce((sum, file) => sum + file.size, 0);

    if (nextTotal > MAX_ATTACHMENT_BYTES) {
      toast.error("Attachments are too large", {
        description: `Please keep total attachments under ${formatBytes(MAX_ATTACHMENT_BYTES)}.`,
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const encoded = await Promise.all(
      nextFiles.map(async (file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        size: file.size,
        content: arrayBufferToBase64(await file.arrayBuffer()),
      }))
    );

    setAttachments((prev) => [...prev, ...encoded]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((file) => file.id !== id));
  }

  /** Direct send via the /api/send-email route. The server reads
   *  SMTP_PASSWORD from env (never shipped to the browser) and relays
   *  through Gmail SMTP. On success we append to the client's
   *  Communication Log and close the dialog. */
  async function handleSendDirect() {
    setSending(true);

    async function sendOne(message: {
      to: string;
      subject: string;
      body: string;
      clientId?: string;
      template?: "renewal" | "birthday" | "custom";
      policyId?: string;
      bcc?: string[];
    }) {
      const bodyWithSignature = renderEmailBody(
        message.body,
        {},
        settings.signature
      );
      const htmlWithSignature = renderEmailHtml(
        message.body,
        {},
        settings.signature
      );
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: message.to.trim(),
          bcc: message.bcc && message.bcc.length > 0 ? message.bcc : undefined,
          subject: message.subject,
          body: bodyWithSignature,
          html: htmlWithSignature,
          clientId: message.clientId,
          attachments: attachments.map(({ filename, contentType, content }) => ({
            filename,
            contentType,
            content,
          })),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        messageId?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `Server responded ${res.status}`);
      }

      const clientId = message.clientId;
      const template = message.template ?? "custom";
      const templateLabel =
        template === "renewal"
          ? "Renewal Reminder"
          : template === "birthday"
          ? "Birthday Greeting"
          : "Custom";

      if (clientId) {
        appendEmailHistory(clientId, {
          subject: message.subject,
          body: message.body,
          templateLabel,
        });

        const stamp = new Date().toLocaleString("en-CA", {
          dateStyle: "short",
          timeStyle: "short",
        });
        prependClientNote(
          clientId,
          `Action Log: ${templateLabel} Sent\n${stamp} — ${message.subject}`
        );
      }

      if (template === "renewal" && message.policyId) {
        markRenewalEmailSent(message.policyId);
      }
      if (template === "birthday" && clientId) {
        markBirthdayEmailSent(clientId);
      }

      return { clientId, template };
    }

    try {
      if (isBatch) {
        let sent = 0;
        for (const item of batch) {
          await sendOne({
            to: item.to,
            subject: item.subject,
            body: item.body,
            clientId: item.clientId,
            template: item.template,
            policyId: item.policyId,
          });
          sent += 1;
        }

        toast.success("Emails sent successfully", {
          description: `${sent} individualized emails delivered.`,
        });
        onSent?.({
          via: "smtp",
          to: batch.map((item) => item.to).join(", "),
          subject: `${sent} individualized emails`,
          body: "Individualized bulk send",
        });
        onOpenChange(false);
        return;
      }

      const bccList = bcc.split(",").map((s) => s.trim()).filter(Boolean);
      await sendOne({
        to: to.trim(),
        bcc: bccList,
        subject,
        body,
        clientId: payload?.clientId,
        template: payload?.template,
        policyId: payload?.policyId,
      });

      // === Post-success bookkeeping (runs in one render cycle) ===
      //
      // All side effects below mutate DataProvider state; React batches
      // them into a single re-render so the dashboard widgets shrink in
      // real time the moment the dialog closes — no manual refetch.
      toast.success("Email sent successfully", {
        description: `Delivered to ${payload?.contextLabel ?? to}`,
      });
      onSent?.({
        via: "smtp",
        to: to.trim(),
        subject,
        body,
        clientId: payload?.clientId,
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

  function recipientPills() {
    if (!isBulk) return null;
    const list = isBatch
      ? batch.map((item) => item.to)
      : bcc
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
                if (isBatch) return;
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
      <DialogContent className="flex max-h-[90dvh] grid-rows-none flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b border-slate-100 px-4 py-4 pr-12">
          <DialogTitle>Compose Email</DialogTitle>
          <DialogDescription>
            {isBulk
              ? isBatch
                ? `Individualized bulk send — ${recipientCount} ${
                    recipientCount === 1 ? "email" : "emails"
                  }`
                : `Bulk message — ${recipientCount} ${
                  recipientCount === 1 ? "recipient" : "recipients"
                } via Bcc`
              : `To ${payload.contextLabel}`}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="email-to">To</Label>
            <Input
              id="email-to"
              type={isBatch ? "text" : "email"}
              value={isBatch ? `${recipientCount} individualized emails` : to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={isBulk ? "" : ""}
              readOnly={isBatch}
            />
            {isBatch ? (
              <p className="text-[11px] text-triton-muted">
                The system sends one personalized email per client. No Bcc is used.
              </p>
            ) : isBulk ? (
              <p className="text-[11px] text-triton-muted">
                Recipients are placed in <strong>Bcc</strong> for privacy.
              </p>
            ) : null}
          </div>

          {isBulk ? (
            <div className="space-y-1.5">
              <Label htmlFor="email-bcc">
                {isBatch ? "Recipients" : "Bcc"}
              </Label>
              {!isBatch ? (
                <Input
                  id="email-bcc"
                  value={bcc}
                  onChange={(e) => setBcc(e.target.value)}
                  placeholder="comma-separated emails"
                />
              ) : null}
              {recipientPills()}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              readOnly={isBatch}
            />
            {isBatch ? (
              <p className="text-[11px] text-triton-muted">
                Previewing the first personalized email. Each recipient gets their own subject and message.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email-body">Message</Label>
            <Textarea
              id="email-body"
              rows={8}
              className="resize-none"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              readOnly={isBatch}
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

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Attachments</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
              >
                <Paperclip className="mr-1.5 h-3.5 w-3.5" />
                Attach
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(event) => void handleAttachmentChange(event.target.files)}
              />
            </div>
            {attachments.length > 0 ? (
              <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2">
                {attachments.map((file) => {
                  const isImage = file.contentType.startsWith("image/");
                  return (
                    <div
                      key={file.id}
                      className="flex items-center gap-2 rounded-md bg-white px-2.5 py-2 text-xs text-slate-700 ring-1 ring-slate-100"
                    >
                      {isImage ? (
                        <ImageIcon className="h-3.5 w-3.5 text-slate-400" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 text-slate-400" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{file.filename}</span>
                      <span className="shrink-0 text-[11px] text-slate-400">
                        {formatBytes(file.size)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(file.id)}
                        className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                        aria-label={`Remove ${file.filename}`}
                        disabled={sending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
                <p className="px-1 text-[11px] text-slate-400">
                  Total: {formatBytes(totalAttachmentBytes)} / {formatBytes(MAX_ATTACHMENT_BYTES)}
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-triton-muted">
                Attach PDFs or images for this send only. Files are not saved in CRM storage.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0 shrink-0 rounded-none rounded-b-xl border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_-20px_rgba(15,23,42,0.35)] backdrop-blur sm:flex-row">
          <Button
            className="bg-navy hover:bg-navy/90 text-white min-w-[140px]"
            onClick={handleSendDirect}
            disabled={
              sending ||
              (isBatch
                ? batch.length === 0
                : !subject.trim() || !body.trim() || !to.trim())
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
