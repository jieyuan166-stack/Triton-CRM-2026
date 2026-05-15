"use client";

import { Mail } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[86vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <Mail className="h-4 w-4 text-slate-400" />
            Sent Email Preview
          </DialogTitle>
          <DialogDescription>
            This is the content that was saved to the client communication history.
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
                <p className="label-caps">Sent</p>
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
            <Label>Subject</Label>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
              {email.subject || "(No subject)"}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Body</Label>
            <Textarea
              readOnly
              value={email.body || ""}
              className="min-h-[18rem] resize-none bg-white text-sm leading-relaxed text-slate-700"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
