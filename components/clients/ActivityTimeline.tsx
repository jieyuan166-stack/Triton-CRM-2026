"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  FileText,
  ListChecks,
  Mail,
  MessageCircle,
  MessageSquare,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  StickyNote,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/DataProvider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui-shared/ConfirmDialog";
import {
  ActivityEntryDialog,
  type ActivityEntryPatch,
} from "@/components/clients/ActivityEntryDialog";
import {
  EmailHistoryPreviewDialog,
  type EmailHistoryPreview,
} from "@/components/dashboard/EmailHistoryPreviewDialog";
import {
  EmailPreviewDialog,
  type EmailPreviewPayload,
} from "@/components/dashboard/EmailPreviewDialog";
import { FollowUpEntryDialog } from "@/components/clients/FollowUpEntryDialog";
import {
  isManualCommunicationLabel,
  parseCommunicationTypes,
  type ManualCommunicationType,
} from "@/lib/communication-log";
import { daysUntil, formatDate } from "@/lib/date-utils";
import { canSendToEmail } from "@/lib/email-address";
import { cn } from "@/lib/utils";
import type { EmailHistoryEntry, FollowUp } from "@/lib/types";

interface ActivityTimelineProps {
  clientId: string;
  followUps: FollowUp[];
  history: EmailHistoryEntry[] | undefined;
}

type ActivityFilter = "all" | "notes" | "emails";
type ActivitySource = "followup" | "history";

interface ActivityItem {
  id: string;
  source: ActivitySource;
  tab: Exclude<ActivityFilter, "all">;
  date: string;
  title: string;
  subtitle: string;
  body?: string;
  icon: React.ElementType;
  accentClassName: string;
  muted: boolean;
  preview: EmailHistoryPreview;
  rawId: string;
  attachmentCount?: number;
  rawEntry?: EmailHistoryEntry;
  rawFollowUp?: FollowUp;
}

const FILTERS: Array<{ value: ActivityFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "notes", label: "Notes" },
  { value: "emails", label: "Emails" },
];

const MANUAL_ICON: Record<ManualCommunicationType, React.ElementType> = {
  "Phone Call": Phone,
  Meeting: Users,
  "Zoom Meeting": Users,
  WeChat: MessageCircle,
  "Text Message": MessageSquare,
  Note: StickyNote,
  "External Email": Mail,
};

const FOLLOWUP_ICON: Record<FollowUp["type"], React.ElementType> = {
  Phone,
  Email: Mail,
  Meeting: Users,
  Note: StickyNote,
  WeChat: MessageCircle,
};

const FOLLOWUP_ACCENT: Record<FollowUp["type"], string> = {
  Phone: "bg-blue-50 text-blue-600 ring-blue-100",
  Email: "bg-purple-50 text-purple-600 ring-purple-100",
  Meeting: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  Note: "bg-slate-100 text-slate-500 ring-slate-200",
  WeChat: "bg-amber-50 text-amber-600 ring-amber-100",
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${formatDate(iso)} ${time}`;
}

function historyDescription(entry: EmailHistoryEntry): string {
  const policyPrefix = entry.policyNumber
    ? `Policy #${entry.policyNumber}${entry.policyLabel ? ` · ${entry.policyLabel}` : ""} — `
    : "";
  if (entry.templateLabel?.startsWith("Email Draft")) {
    return entry.subject?.trim()
      ? `${policyPrefix}Draft email - ${entry.subject.trim()}`
      : `${policyPrefix}Draft email`;
  }
  if (isManualCommunicationLabel(entry.templateLabel)) {
    return entry.subject?.trim()
      ? `${entry.templateLabel}: ${policyPrefix}${entry.subject.trim()}`
      : entry.templateLabel;
  }
  if (entry.templateLabel) return `${policyPrefix}Sent "${entry.templateLabel}" Email`;
  return entry.subject?.trim() ? `${policyPrefix}Sent email - ${entry.subject.trim()}` : "Sent email";
}

function followUpTimestamp(followUp: FollowUp): string {
  return followUp.createdAt || `${followUp.date}T12:00:00.000`;
}

function isEmailDraft(entry?: EmailHistoryEntry) {
  return entry?.templateLabel?.startsWith("Email Draft") ?? false;
}

function draftTemplate(entry: EmailHistoryEntry): EmailPreviewPayload["template"] {
  if (entry.templateLabel === "Email Draft · Birthday") return "birthday";
  if (entry.templateLabel === "Email Draft · Renewal") return "renewal";
  if (entry.templateLabel === "Email Draft · Festival") return "festival";
  return "custom";
}

export function ActivityTimeline({
  clientId,
  followUps,
  history,
}: ActivityTimelineProps) {
  const {
    appendEmailHistory,
    updateEmailHistory,
    deleteEmailHistory,
    deleteFollowUp,
    completeFollowUp,
    createFollowUp,
    getClient,
    getPoliciesByClient,
  } = useData();
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [entryDialog, setEntryDialog] = useState<
    { mode: "create" } | { mode: "edit"; entry: EmailHistoryEntry } | null
  >(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composePayload, setComposePayload] =
    useState<EmailPreviewPayload | null>(null);
  const [followUpDialogOpen, setFollowUpDialogOpen] = useState(false);
  const [preview, setPreview] = useState<EmailHistoryPreview | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ActivityItem | null>(null);
  const policies = getPoliciesByClient(clientId);
  const client = getClient(clientId);
  const activeFollowUpSummary = useMemo(() => {
    const active = followUps.filter((followUp) => !followUp.completedAt);
    const due = active.filter((followUp) => {
      if (followUp.deadline) return daysUntil(followUp.deadline) <= 30;
      return followUp.importance === "High";
    });
    const overdue = due.filter((followUp) => !!followUp.deadline && daysUntil(followUp.deadline) < 0);
    const today = due.filter((followUp) => !!followUp.deadline && daysUntil(followUp.deadline) === 0);
    const high = due.filter((followUp) => followUp.importance === "High");
    return { due, overdue, today, high };
  }, [followUps]);

  function openEmailToClient() {
    if (!client) {
      toast.error("Client not found.");
      return;
    }
    const hasValidEmail = canSendToEmail(client.email);
    const fullName =
      `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() ||
      client.companyName ||
      "Client";
    setComposePayload({
      contextLabel: fullName,
      to: hasValidEmail ? client.email : "",
      subject: "",
      body: "",
      clientId: client.id,
      template: "custom",
    });
    setComposeOpen(true);
    if (!hasValidEmail) {
      toast.message("Add a recipient email", {
        description: "This client has no real email on file, so the To field is blank.",
      });
    }
  }

  function openDraftEmail(entry: EmailHistoryEntry) {
    if (!client) {
      toast.error("Client not found.");
      return;
    }
    const hasValidEmail = canSendToEmail(client.email);
    const fullName =
      `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() ||
      client.companyName ||
      "Client";
    setComposePayload({
      contextLabel: fullName,
      to: hasValidEmail ? client.email : "",
      subject: entry.subject ?? "",
      body: entry.body ?? "",
      clientId: client.id,
      template: draftTemplate(entry),
      policyId: entry.policyId,
      draftEntryId: entry.id,
      communicationType: entry.communicationType || "External Email",
      attachments: [],
    });
    setComposeOpen(true);
    if (!hasValidEmail) {
      toast.message("Add a recipient email", {
        description: "This client has no real email on file, so the To field is blank.",
      });
    }
  }

  const items = useMemo<ActivityItem[]>(() => {
    const followUpItems = followUps.map((followUp) => {
      const Icon = FOLLOWUP_ICON[followUp.type];
      return {
        id: `followup:${followUp.id}`,
        rawId: followUp.id,
        source: "followup" as const,
        tab: "notes" as const,
        date: followUpTimestamp(followUp),
        title: followUp.summary,
        subtitle: [
          followUp.type,
          followUp.policyNumber
            ? `Policy #${followUp.policyNumber}${followUp.policyLabel ? ` · ${followUp.policyLabel}` : ""}`
            : undefined,
          followUp.createdByName,
          followUp.deadline ? `Deadline ${formatDate(followUp.deadline)}` : undefined,
        ].filter(Boolean).join(" · "),
        body: followUp.details,
        icon: Icon,
        accentClassName: FOLLOWUP_ACCENT[followUp.type],
        muted: !!followUp.completedAt,
        rawFollowUp: followUp,
        preview: {
          date: followUpTimestamp(followUp),
          subject: followUp.summary,
          body: followUp.details ?? "",
          policyLabel: followUp.policyLabel,
          policyNumber: followUp.policyNumber,
          templateLabel:
            followUp.type === "Phone"
              ? "Phone Call"
              : followUp.type === "Email"
                ? "External Email"
                : followUp.type,
        },
      };
    });

    const historyItems = (history ?? []).map((entry) => {
      const manualLabel = isManualCommunicationLabel(entry.templateLabel)
        ? entry.templateLabel
        : undefined;
      const isManual = !!manualLabel;
      const isExternalEmail = entry.templateLabel === "External Email";
      const isDraft = entry.templateLabel?.startsWith("Email Draft") ?? false;
      const Icon = isDraft ? FileText : manualLabel ? MANUAL_ICON[manualLabel] : Mail;
      const attachmentCount = entry.attachments?.length ?? 0;
      return {
        id: `history:${entry.id}`,
        rawId: entry.id,
        source: "history" as const,
        tab: isManual && !isExternalEmail && !isDraft ? "notes" as const : "emails" as const,
        date: entry.date,
        title: historyDescription(entry),
        subtitle: isDraft
          ? entry.policyNumber
            ? `Draft email · #${entry.policyNumber}${attachmentCount > 0 ? ` · ${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}` : ""}`
            : `Draft email${attachmentCount > 0 ? ` · ${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}` : ""}`
          : isManual
          ? isExternalEmail
            ? attachmentCount > 0
              ? `External email · ${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}`
              : "External email"
            : entry.policyNumber
              ? `Manual log · #${entry.policyNumber}${attachmentCount > 0 ? ` · ${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}` : ""}`
              : `Manual log${attachmentCount > 0 ? ` · ${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}` : ""}`
          : entry.policyNumber
            ? `System email · #${entry.policyNumber}${attachmentCount > 0 ? ` · ${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}` : ""}`
            : `System email${attachmentCount > 0 ? ` · ${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}` : ""}`,
        body: entry.body,
        icon: Icon,
        accentClassName:
          isDraft
            ? "bg-amber-50 text-amber-700 ring-amber-100"
            : isManual && !isExternalEmail
            ? "bg-blue-50 text-blue-600 ring-blue-100"
            : "bg-slate-100 text-slate-400 ring-slate-200",
        muted: (!isManual || isExternalEmail) && !isDraft,
        preview: {
          to: getClient(clientId)?.email,
          date: entry.date,
          subject: entry.subject,
          body: entry.body,
          templateLabel: entry.templateLabel,
          policyLabel: entry.policyLabel,
          policyNumber: entry.policyNumber,
          attachments: entry.attachments,
        },
        attachmentCount,
        rawEntry: entry,
      };
    });

    return [...followUpItems, ...historyItems].sort((a, b) =>
      a.date < b.date ? 1 : -1
    );
  }, [clientId, followUps, getClient, history]);

  const filteredItems =
    filter === "all" ? items : items.filter((item) => item.tab === filter);

  function handleEntrySave(patch: ActivityEntryPatch) {
    if (entryDialog?.mode === "edit") {
      const updated = updateEmailHistory(clientId, entryDialog.entry.id, patch);
      if (!updated) {
        toast.error("Unable to update activity.");
        return false;
      }
      toast.success("Activity updated");
      return true;
    }
    const saved = appendEmailHistory(clientId, {
      subject: patch.subject ?? "",
      body: patch.body ?? "",
      templateLabel: patch.templateLabel,
      communicationType: patch.communicationType,
      policyId: patch.policyId ?? undefined,
      policyNumber: patch.policyNumber ?? undefined,
      policyLabel: patch.policyLabel ?? undefined,
    });
    if (!saved) {
      toast.error("Unable to save activity.");
      return false;
    }
    toast.success("Activity added", { description: patch.templateLabel ?? "Activity" });
    return true;
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.source === "followup") {
      const ok = deleteFollowUp(deleteTarget.rawId);
      if (!ok) {
        toast.error("Could not delete follow-up.");
        return;
      }
      toast.success("Follow-up deleted.");
      return;
    }
    const removed = deleteEmailHistory(clientId, [deleteTarget.rawId]);
    if (!removed) {
      toast.error("Could not delete activity.");
      return;
    }
    toast.success("Activity deleted.");
  }

  function handleMarkFollowUpDone(followUp: FollowUp) {
    const ok = completeFollowUp(followUp.id);
    if (!ok) {
      toast.error("Could not complete follow-up.");
      return;
    }
    toast.success("Follow-up marked done", { description: followUp.summary });
  }

  return (
    <>
      <div id="activity" className="scroll-mt-28 rounded-xl border border-slate-200 bg-card shadow-sm">
        <div className="border-b border-slate-100 px-5 py-5">
          <div className="flex flex-col gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-bold uppercase tracking-widest text-slate-700">
                Activity Timeline
              </h3>
              <p className="mt-0.5 text-xs text-triton-muted">
                Client touchpoints, notes, and sent emails.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                className="col-span-2 h-8 min-w-0 justify-center bg-navy px-2 text-xs text-white hover:bg-navy/90"
                onClick={openEmailToClient}
                title="Compose an email to this client"
              >
                <Mail className="mr-1 h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Email to Client</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 min-w-0 justify-center px-2 text-xs"
                onClick={() => setEntryDialog({ mode: "create" })}
              >
                <Plus className="mr-1 h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Add Activity</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 min-w-0 justify-center border-[#C99A3A]/40 bg-[#C99A3A]/5 px-2 text-xs text-navy hover:bg-[#C99A3A]/10"
                onClick={() => setFollowUpDialogOpen(true)}
              >
                <ListChecks className="mr-1 h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Add Follow-up</span>
              </Button>
            </div>
          </div>

          <div className="mt-4 inline-flex rounded-full bg-slate-50 p-1 ring-1 ring-slate-100">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
                  filter === item.value
                    ? "bg-card text-navy shadow-sm"
                    : "text-slate-400 hover:text-slate-600"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {activeFollowUpSummary.due.length > 0 ? (
            <div
              className={cn(
                "mt-4 rounded-xl border px-3 py-3",
                activeFollowUpSummary.overdue.length > 0
                  ? "border-rose-200 bg-rose-50/70"
                  : "border-[#C99A3A]/30 bg-[#C99A3A]/10"
              )}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    activeFollowUpSummary.overdue.length > 0
                      ? "text-rose-600"
                      : "text-[#8A641F]"
                  )}
                />
                <div className="min-w-0">
                  <p
                    className={cn(
                      "text-xs font-bold uppercase tracking-wider",
                      activeFollowUpSummary.overdue.length > 0
                        ? "text-rose-700"
                        : "text-[#6F4F16]"
                    )}
                  >
                    {activeFollowUpSummary.due.length} follow-up{activeFollowUpSummary.due.length === 1 ? "" : "s"} need attention
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    {activeFollowUpSummary.overdue.length > 0
                      ? `${activeFollowUpSummary.overdue.length} overdue`
                      : activeFollowUpSummary.today.length > 0
                        ? `${activeFollowUpSummary.today.length} due today`
                        : "Upcoming or high-priority follow-ups"}
                    {activeFollowUpSummary.high.length > 0
                      ? ` · ${activeFollowUpSummary.high.length} high priority`
                      : ""}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {filteredItems.length === 0 ? (
          <div className="px-5 pb-5 pt-4">
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-7 text-center">
              <ListChecks className="mx-auto h-5 w-5 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-600">
                No activity yet
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {filter === "emails"
                  ? "Sent emails will appear here."
                  : filter === "notes"
                    ? "Manual touchpoints and follow-ups will appear here."
                    : "Add a note or send an email to start the timeline."}
              </p>
            </div>
          </div>
        ) : (
          <ul className="max-h-[38rem] overflow-y-auto px-4 py-3">
            {filteredItems.map((item) => {
              const Icon = item.icon;
              const opensDraft = isEmailDraft(item.rawEntry);
              const handlePrimaryClick = () => {
                if (opensDraft && item.rawEntry) {
                  openDraftEmail(item.rawEntry);
                  return;
                }
                setPreview(item.preview);
              };
              return (
                <li
                  key={item.id}
                  className={cn(
                    "group rounded-xl px-2 py-2.5 transition-colors",
                    item.muted
                      ? "text-slate-400 hover:bg-slate-50"
                      : "hover:bg-blue-50/40"
                  )}
                >
                  <div className="flex gap-3">
                    <button
                      type="button"
                      aria-label={opensDraft ? `Continue ${item.title}` : `Preview ${item.title}`}
                      onClick={handlePrimaryClick}
                      className={cn(
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 transition-colors",
                        item.accentClassName
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={handlePrimaryClick}
                          className={cn(
                            "min-w-0 text-left text-sm leading-snug",
                            item.muted
                              ? "font-normal text-slate-500"
                              : "font-medium text-slate-800"
                          )}
                        >
                          <span className="line-clamp-2">
                            {item.title}
                            {item.attachmentCount ? (
                              <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200">
                                <Paperclip className="h-2.5 w-2.5" />
                                {item.attachmentCount}
                              </span>
                            ) : null}
                          </span>
                        </button>
                        <div className="flex shrink-0 items-center gap-1">
                          {item.rawFollowUp && !item.rawFollowUp.completedAt ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                              onClick={() => handleMarkFollowUpDone(item.rawFollowUp!)}
                            >
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              Mark Done
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="h-7 w-7 text-slate-300 opacity-0 transition-opacity hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
                            aria-label={`Delete ${item.title}`}
                            onClick={() => setDeleteTarget(item)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        {item.rawEntry ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="h-7 w-7 shrink-0 text-slate-300 opacity-0 transition-opacity hover:bg-blue-50 hover:text-blue-700 group-hover:opacity-100"
                            aria-label={`Edit ${item.title}`}
                            onClick={() => setEntryDialog({ mode: "edit", entry: item.rawEntry! })}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {formatTimestamp(item.date)}
                        </span>
                        {item.subtitle ? <span>{item.subtitle}</span> : null}
                        {item.rawFollowUp?.deadline ? (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                            Due {formatDate(item.rawFollowUp.deadline)}
                          </span>
                        ) : null}
                        {item.rawFollowUp?.importance ? (
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                              item.rawFollowUp.importance === "High"
                                ? "bg-rose-50 text-rose-700"
                                : item.rawFollowUp.importance === "Medium"
                                  ? "bg-[#C99A3A]/10 text-[#8A641F]"
                                  : "bg-slate-100 text-slate-500"
                            )}
                          >
                            {item.rawFollowUp.importance}
                          </span>
                        ) : null}
                        {item.rawFollowUp?.completedAt ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" />
                            Done {formatDate(item.rawFollowUp.completedAt)}
                          </span>
                        ) : null}
                        {item.rawEntry
                          ? parseCommunicationTypes(
                              item.rawEntry.templateLabel ||
                                item.rawEntry.communicationType
                            ).map((type) => (
                              <span
                                key={type}
                                className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500"
                              >
                                {type}
                              </span>
                            ))
                          : null}
                      </div>
                    </div>
                  </div>
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

      <EmailPreviewDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        payload={composePayload}
      />

      <FollowUpEntryDialog
        open={followUpDialogOpen}
        onOpenChange={setFollowUpDialogOpen}
        clientId={clientId}
        policies={policies}
        onSave={(input) => {
          const saved = createFollowUp(input);
          toast.success("Follow-up added", { description: input.summary });
          return saved;
        }}
      />

      <ActivityEntryDialog
        open={!!entryDialog}
        onOpenChange={(open) => {
          if (!open) setEntryDialog(null);
        }}
        mode={entryDialog?.mode ?? "create"}
        policies={policies}
        entry={entryDialog?.mode === "edit" ? entryDialog.entry : undefined}
        defaultType="Note"
        onSave={handleEntrySave}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete activity?"
        description="This will permanently delete this activity entry. This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
      />
    </>
  );
}
