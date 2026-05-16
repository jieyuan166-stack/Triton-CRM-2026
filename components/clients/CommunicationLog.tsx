// components/clients/CommunicationLog.tsx
//
// Per-client communication timeline. Source of truth is
// `client.emailHistory` on the data layer — appended automatically by
// EmailPreviewDialog when a /api/send-email POST returns ok.
//
// Display rules:
//   - One line per event: [icon] · [date & time] · [action description]
//   - No body text, no expandable rows, no preview snippet.
//   - Newest first.
//   - Entries can be deleted one at a time or in bulk after confirmation.

"use client";

import { useMemo, useState } from "react";
import {
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Plus,
  StickyNote,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/DataProvider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui-shared/ConfirmDialog";
import { EmailHistoryPreviewDialog, type EmailHistoryPreview } from "@/components/dashboard/EmailHistoryPreviewDialog";
import { EmptyState } from "@/components/ui-shared/EmptyState";
import {
  isManualCommunicationLabel,
  MANUAL_COMMUNICATION_TYPES,
  type ManualCommunicationType,
} from "@/lib/communication-log";
import { formatDate } from "@/lib/date-utils";
import type { EmailHistoryEntry } from "@/lib/types";

interface CommunicationLogProps {
  clientId: string;
  history: EmailHistoryEntry[] | undefined;
}

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${formatDate(iso)} ${time}`;
}

/** Build the "Sent X Email" action description. Falls back gracefully
 *  when older entries lack the templateLabel field. */
function actionDescription(entry: EmailHistoryEntry): string {
  if (isManualCommunicationLabel(entry.templateLabel)) {
    return entry.subject?.trim()
      ? `${entry.templateLabel}: ${entry.subject.trim()}`
      : entry.templateLabel;
  }
  if (entry.templateLabel) {
    return `Sent "${entry.templateLabel}" Email`;
  }
  // Back-compat for entries written before templateLabel existed: derive
  // a label from the subject so the row still reads naturally.
  const subj = entry.subject?.trim();
  return subj ? `Sent email - ${subj}` : "Sent email";
}

function iconForEntry(entry: EmailHistoryEntry) {
  switch (entry.templateLabel) {
    case "Phone Call":
      return Phone;
    case "Meeting":
      return Users;
    case "WeChat":
      return MessageCircle;
    case "Text Message":
      return MessageSquare;
    case "Note":
      return StickyNote;
    case "External Email":
      return Mail;
    default:
      return Mail;
  }
}

export function CommunicationLog({ clientId, history }: CommunicationLogProps) {
  const { appendEmailHistory, deleteEmailHistory, getClient } = useData();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<EmailHistoryPreview | null>(null);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [manualType, setManualType] =
    useState<ManualCommunicationType>("Phone Call");
  const [manualSummary, setManualSummary] = useState("");
  const [manualDetails, setManualDetails] = useState("");

  // Sort newest-first without mutating the caller's array.
  const sorted = [...(history ?? [])].sort((a, b) =>
    a.date < b.date ? 1 : -1
  );
  const sortedIds = useMemo(() => sorted.map((entry) => entry.id), [sorted]);
  const selectedCount = selected.size;
  const allChecked =
    sortedIds.length > 0 && sortedIds.every((id) => selected.has(id));
  const someChecked =
    !allChecked && sortedIds.some((id) => selected.has(id));

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(sortedIds) : new Set());
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function requestDelete(ids: string[]) {
    setDeletingIds(Array.from(new Set(ids.filter(Boolean))));
  }

  async function confirmDelete() {
    if (deletingIds.length === 0) return;
    const removed = deleteEmailHistory(clientId, deletingIds);
    setSelected((prev) => {
      const next = new Set(prev);
      deletingIds.forEach((id) => next.delete(id));
      return next;
    });
    const count = removed || deletingIds.length;
    toast.success(
      `Deleted ${count} communication log ${count === 1 ? "entry" : "entries"}.`
    );
  }

  function resetManualForm() {
    setAdding(false);
    setManualType("Phone Call");
    setManualSummary("");
    setManualDetails("");
  }

  function handleManualSubmit(event: React.FormEvent) {
    event.preventDefault();
    const summary = manualSummary.trim();
    if (!summary) return;
    const saved = appendEmailHistory(clientId, {
      subject: summary,
      body: manualDetails.trim(),
      templateLabel: manualType,
    });
    if (!saved) {
      toast.error("Unable to save communication log.");
      return;
    }
    toast.success("Communication log added", { description: manualType });
    resetManualForm();
  }

  return (
    <>
      <div className="bg-card rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <div>
            <div className="flex items-center gap-2">
              {sorted.length > 0 ? (
                <Checkbox
                  aria-label="Select all communication log entries"
                  checked={allChecked}
                  indeterminate={someChecked}
                  onCheckedChange={(checked) => toggleAll(checked === true)}
                />
              ) : null}
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Communication Log
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-triton-muted">
              When &amp; what - emails and manual touchpoints for this client
              {sorted.length > 0
                ? ` (${sorted.length} ${sorted.length === 1 ? "entry" : "entries"})`
                : ""}
              .
            </p>
          </div>

          {selectedCount > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">
                {selectedCount} selected
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => requestDelete(Array.from(selected))}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setAdding((value) => !value)}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {adding ? "Close" : "Add Log"}
            </Button>
          )}
        </div>

        {adding ? (
          <form
            onSubmit={handleManualSubmit}
            className="mx-5 my-4 rounded-xl border border-slate-100 bg-slate-50/70 p-4 md:mx-6"
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[12rem_minmax(0,1fr)]">
              <div className="space-y-1.5">
                <Label htmlFor="communication-type" className="label-caps">
                  Type
                </Label>
                <Select
                  value={manualType}
                  onValueChange={(value) =>
                    setManualType(value as ManualCommunicationType)
                  }
                >
                  <SelectTrigger id="communication-type" className="h-9 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MANUAL_COMMUNICATION_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="communication-summary" className="label-caps">
                  Summary <span className="text-accent-red">*</span>
                </Label>
                <Input
                  id="communication-summary"
                  value={manualSummary}
                  onChange={(event) => setManualSummary(event.target.value)}
                  placeholder="e.g. Called about pending premium payment"
                  className="h-9 bg-white"
                  required
                />
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              <Label htmlFor="communication-details" className="label-caps">
                Details
              </Label>
              <Textarea
                id="communication-details"
                value={manualDetails}
                onChange={(event) => setManualDetails(event.target.value)}
                placeholder="Optional details..."
                rows={3}
                className="resize-none bg-white"
              />
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={resetManualForm}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-navy text-white hover:bg-navy/90"
                disabled={!manualSummary.trim()}
              >
                Save Log
              </Button>
            </div>
          </form>
        ) : null}

        {sorted.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="No communication yet"
            description="Emails and manual touchpoints will appear here."
            compact
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {sorted.map((entry) => {
              const isChecked = selected.has(entry.id);
              const action = actionDescription(entry);
              const Icon = iconForEntry(entry);
              return (
                <li
                  key={entry.id}
                  className={`flex items-center gap-3 px-5 py-2.5 transition-colors md:px-6 ${
                    isChecked ? "bg-accent-blue/5" : "hover:bg-slate-50"
                  }`}
                >
                  <Checkbox
                    aria-label={`Select communication log entry ${action}`}
                    checked={isChecked}
                    onCheckedChange={(checked) =>
                      toggleOne(entry.id, checked === true)
                    }
                  />

                  <button
                    type="button"
                    aria-label={`Preview ${action}`}
                    onClick={() =>
                      setPreview({
                        to: getClient(clientId)?.email,
                        date: entry.date,
                        subject: entry.subject,
                        body: entry.body,
                        templateLabel: entry.templateLabel,
                      })
                    }
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-blue/10 text-accent-blue transition-colors hover:bg-accent-blue/15"
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>

                  <span className="w-[10.5rem] shrink-0 font-number text-xs text-triton-muted">
                    {fmtTimestamp(entry.date)}
                  </span>

                  <span className="min-w-0 flex-1 truncate text-sm text-triton-text">
                    {action}
                  </span>

                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label={`Delete ${action}`}
                    onClick={() => requestDelete([entry.id])}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <EmailHistoryPreviewDialog
        open={!!preview}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
        email={preview}
      />

      <ConfirmDialog
        open={deletingIds.length > 0}
        onOpenChange={(open) => {
          if (!open) setDeletingIds([]);
        }}
        title="Delete communication log?"
        description={
          <>
            This will permanently delete{" "}
            <span className="font-semibold">
              {deletingIds.length} communication log{" "}
              {deletingIds.length === 1 ? "entry" : "entries"}
            </span>{" "}
            for this client. This action cannot be undone.
          </>
        }
        confirmLabel={`Delete ${deletingIds.length === 1 ? "entry" : "entries"}`}
        onConfirm={confirmDelete}
      />
    </>
  );
}
