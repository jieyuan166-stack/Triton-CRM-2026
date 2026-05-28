"use client";

import { Mail, MessageCircle, Paperclip, StickyNote } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isManualCommunicationLabel } from "@/lib/communication-log";
import { formatDate } from "@/lib/date-utils";
import type { EmailHistoryAttachment, EmailHistoryPolicyContext } from "@/lib/types";

export interface EmailHistoryPreview {
  to?: string;
  date?: string;
  subject: string;
  body: string;
  templateLabel?: string;
  policyLabel?: string;
  policyNumber?: string;
  policyContexts?: EmailHistoryPolicyContext[];
  attachments?: EmailHistoryAttachment[];
}

interface EmailHistoryPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: EmailHistoryPreview | null;
}

export function EmailHistoryPreviewDialog({
  open,
  onOpenChange,
  email,
}: EmailHistoryPreviewDialogProps) {
  if (!email) return null;
  const isManual = isManualCommunicationLabel(email.templateLabel);
  const PreviewIcon = isManual ? MessageCircle : Mail;
  function formatBytes(bytes?: number) {
    if (!bytes || bytes < 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[86vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <PreviewIcon className="h-4 w-4 text-slate-400" />
            {isManual ? "Communication Log Preview" : "Sent Email Preview"}
          </DialogTitle>
          <DialogDescription>
            {isManual
              ? "This is the manual communication record saved to the client history."
              : "This is the content that was saved to the client communication history."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-4 text-sm md:grid-cols-2">
            {email.to ? (
              <div>
                <p className="label-caps">To</p>
                <p className="mt-1 text-slate-800 break-words">{email.to}</p>
              </div>
            ) : null}
            {email.date ? (
              <div>
                <p className="label-caps">{isManual ? "Recorded" : "Sent"}</p>
                <p className="mt-1 text-slate-800">{formatDate(email.date)}</p>
              </div>
            ) : null}
            {email.templateLabel ? (
              <div className="md:col-span-2">
                <p className="label-caps">Action</p>
                <p className="mt-1 text-slate-800">{email.templateLabel}</p>
              </div>
            ) : null}
            {(email.policyContexts && email.policyContexts.length > 0) || email.policyLabel || email.policyNumber ? (
              <div className="md:col-span-2">
                <p className="label-caps">Target {email.policyContexts && email.policyContexts.length > 1 ? "Policies" : "Policy"}</p>
                <div className="mt-1 space-y-1 text-slate-800">
                  {(email.policyContexts && email.policyContexts.length > 0
                    ? email.policyContexts
                    : [{ policyLabel: email.policyLabel, policyNumber: email.policyNumber }]
                  ).map((policy, index) => (
                    <p key={`${policy.policyId ?? policy.policyNumber ?? index}`} className="break-words">
                      {[policy.policyLabel, policy.policyNumber ? `#${policy.policyNumber}` : ""].filter(Boolean).join(" · ")}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
            {email.attachments && email.attachments.length > 0 ? (
              <div className="md:col-span-2">
                <p className="label-caps">Attachments</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {email.attachments.map((attachment, index) => (
                    <span
                      key={`${attachment.filename}-${index}`}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs text-slate-700 ring-1 ring-slate-200"
                    >
                      <Paperclip className="h-3 w-3 shrink-0 text-slate-400" />
                      <span className="min-w-0 truncate">{attachment.filename}</span>
                      {formatBytes(attachment.size) ? (
                        <span className="shrink-0 text-[10px] text-slate-400">
                          {formatBytes(attachment.size)}
                        </span>
                      ) : null}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>{isManual ? "Summary" : "Subject"}</Label>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
              {email.subject || (isManual ? "(No summary)" : "(No subject)")}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{isManual ? "Details" : "Body"}</Label>
            {email.body ? (
              <Textarea
                readOnly
                value={email.body}
                className="min-h-[18rem] resize-none bg-white text-sm leading-relaxed text-slate-700"
              />
            ) : (
              <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
                <StickyNote className="mr-2 h-4 w-4" />
                No details recorded.
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
