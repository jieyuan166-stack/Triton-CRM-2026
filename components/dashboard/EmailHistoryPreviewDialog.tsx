"use client";

import { Mail, MessageCircle, StickyNote } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isManualCommunicationLabel } from "@/lib/communication-log";
import { formatDate } from "@/lib/date-utils";

export interface EmailHistoryPreview {
  to?: string;
  date?: string;
  subject: string;
  body: string;
  templateLabel?: string;
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
