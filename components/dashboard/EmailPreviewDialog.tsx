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
  const [attachments, setAttachments] = useState<ComposeAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open && payload) {
      setTo(payload.to);
      setBcc(payload.bcc ?? "");
      setSubject(payload.subject);
      setBody(payload.body);
      setAttachments([]);
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

        <DialogFooter>
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
