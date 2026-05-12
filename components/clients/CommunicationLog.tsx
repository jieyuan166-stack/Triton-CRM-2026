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
import { Mail, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/DataProvider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui-shared/ConfirmDialog";
import { EmptyState } from "@/components/ui-shared/EmptyState";
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
  if (entry.templateLabel) {
    return `Sent "${entry.templateLabel}" Email`;
  }
  // Back-compat for entries written before templateLabel existed: derive
  // a label from the subject so the row still reads naturally.
  const subj = entry.subject?.trim();
  return subj ? `Sent email - ${subj}` : "Sent email";
}

export function CommunicationLog({ clientId, history }: CommunicationLogProps) {
  const { deleteEmailHistory } = useData();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<string[]>([]);

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
              When &amp; what - emails sent to this client from the CRM
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
          ) : null}
        </div>

        {sorted.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="No emails sent yet"
            description="Emails sent from the client header or the dashboard widgets will appear here."
            compact
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {sorted.map((entry) => {
              const isChecked = selected.has(entry.id);
              const action = actionDescription(entry);
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

                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-blue/10 text-accent-blue">
                    <Mail className="h-3.5 w-3.5" />
                  </span>

                  <span className="w-[10.5rem] shrink-0 font-mono text-xs tabular-nums text-triton-muted">
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
