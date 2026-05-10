// components/clients/CommunicationLog.tsx
//
// Per-client communication timeline. Source of truth is
// `client.emailHistory` on the data layer — appended automatically by
// EmailPreviewDialog when a /api/send-email POST returns ok.
//
// Display rules (per spec):
//   - One line per event: [icon] · [date & time] · [action description]
//   - No body text, no expandable rows, no preview snippet.
//   - Newest first.
//
// The body is still preserved on the entry for future audit / export —
// it's just deliberately ignored by this view.

"use client";

import { Mail } from "lucide-react";
import { EmptyState } from "@/components/ui-shared/EmptyState";
import { formatDate } from "@/lib/date-utils";
import type { EmailHistoryEntry } from "@/lib/types";

interface CommunicationLogProps {
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
  return subj ? `Sent email — ${subj}` : "Sent email";
}

export function CommunicationLog({ history }: CommunicationLogProps) {
  // Sort newest-first without mutating the caller's array.
  const sorted = [...(history ?? [])].sort((a, b) =>
    a.date < b.date ? 1 : -1
  );

  return (
    <div className="bg-card rounded-xl border border-slate-200 shadow-sm">
      <div className="px-5 md:px-6 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Communication Log
        </h3>
        <p className="text-xs text-triton-muted mt-0.5">
          When &amp; what — emails sent to this client from the CRM
          {sorted.length > 0
            ? ` (${sorted.length} ${sorted.length === 1 ? "entry" : "entries"})`
            : ""}
          .
        </p>
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
          {sorted.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-3 px-5 md:px-6 py-2.5 hover:bg-slate-50 transition-colors"
            >
              {/* Icon column. Fixed-size box keeps timestamps and action
                  descriptions aligned vertically across rows even when
                  the action text wraps on narrow viewports. */}
              <span className="h-7 w-7 rounded-md bg-accent-blue/10 text-accent-blue flex items-center justify-center shrink-0">
                <Mail className="h-3.5 w-3.5" />
              </span>

              {/* Timestamp column — monospace digits keep the column
                  optically aligned without needing a real CSS table. */}
              <span className="text-xs text-triton-muted tabular-nums font-mono shrink-0 w-[10.5rem]">
                {fmtTimestamp(entry.date)}
              </span>

              {/* Action description — fills the rest of the row. */}
              <span className="text-sm text-triton-text truncate flex-1 min-w-0">
                {actionDescription(entry)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
