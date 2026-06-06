// components/dashboard/UpcomingPremiums.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, Mail, MailX, RotateCcw, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useData } from "@/components/providers/DataProvider";
import { useSettings } from "@/components/providers/SettingsProvider";
import { WidgetCard } from "@/components/ui-shared/WidgetCard";
import { EmptyState } from "@/components/ui-shared/EmptyState";
import { ClientNameDisplay } from "@/components/ui-shared/ClientNameDisplay";
import { UniversalDataCard } from "@/components/ui-shared/UniversalDataCard";
import { StatusBadge } from "@/components/ui-shared/StatusBadge";
import { ConfirmDialog } from "@/components/ui-shared/ConfirmDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  EmailPreviewDialog,
  type EmailPreviewPayload,
} from "@/components/dashboard/EmailPreviewDialog";
import {
  EmailHistoryPreviewDialog,
  type EmailHistoryPreview,
} from "@/components/dashboard/EmailHistoryPreviewDialog";
import { CARRIER_COLORS } from "@/lib/carrier-colors";
import { clientPath } from "@/lib/client-slug";
import { calculateClientTags } from "@/lib/client-tags";
import { formatDate, formatRelative } from "@/lib/date-utils";
import { canSendToEmail, isPlaceholderEmail } from "@/lib/email-address";
import { formatCurrency } from "@/lib/format";
import { applyTemplate } from "@/lib/templates";
import {
  buildPremiumReminderState,
  PREMIUM_REMINDER_WINDOW_DAYS,
} from "@/lib/premium-reminders";
import { cn } from "@/lib/utils";

const WINDOW_DAYS = PREMIUM_REMINDER_WINDOW_DAYS;

export function UpcomingPremiums() {
  const {
    policies,
    clients,
    emailReminderSends,
    recordEmailReminderSend,
    markEmailReminderSendsSeen,
  } = useData();
  const { settings } = useSettings();
  const renewalTpl = settings.templates.find((t) => t.id === "renewal") ?? { subject: "", body: "", attachments: [] };

  const premiumReminderState = useMemo(
    () => buildPremiumReminderState({ policies, clients, emailReminderSends }),
    [clients, emailReminderSends, policies]
  );
  const upcomingRows = premiumReminderState.pendingRows;
  const completedRows = premiumReminderState.completedRows;
  const unseenCompletedRows = completedRows.filter((row) => !row.reminderSend?.seenAt);
  const unseenCompletedIds = useMemo(
    () =>
      completedRows
        .filter((row) => !row.reminderSend?.seenAt)
        .map((row) => row.reminderSend?.id)
        .filter((id): id is string => !!id),
    [completedRows]
  );

  function findRenewalHistory(clientId: string, policyNumber: string) {
    const client = clients.find((c) => c.id === clientId);
    const renewalEntries = (client?.emailHistory ?? [])
      .filter((entry) => {
        const label = entry.templateLabel?.toLowerCase() ?? "";
        const subject = entry.subject?.toLowerCase() ?? "";
        return (
          label.includes("renewal") ||
          subject.includes("renewal") ||
          subject.includes("premium") ||
          subject.includes("reminder")
        );
      })
      .sort((a, b) => (a.date > b.date ? -1 : 1));

    return (
      renewalEntries.find((entry) =>
        policyNumber
          ? entry.subject.includes(policyNumber) || entry.body.includes(policyNumber)
          : false
      ) ?? renewalEntries[0]
    );
  }

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("upcoming");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [payload, setPayload] = useState<EmailPreviewPayload | null>(null);
  const [sentPreview, setSentPreview] = useState<EmailHistoryPreview | null>(null);
  const [dismissingReminderId, setDismissingReminderId] = useState<string | null>(null);
  const [bulkRemoveOpen, setBulkRemoveOpen] = useState(false);

  useEffect(() => {
    if (activeTab !== "completed" || unseenCompletedIds.length === 0) return;
    const timer = window.setTimeout(() => {
      markEmailReminderSendsSeen(unseenCompletedIds);
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [activeTab, markEmailReminderSendsSeen, unseenCompletedIds]);

  const allIds = upcomingRows.map((r) => r.id);
  const allChecked = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someChecked = selected.size > 0 && !allChecked;
  const selectedRows = Array.from(selected)
    .map((id) => upcomingRows.find((row) => row.id === id))
    .filter((row): row is NonNullable<typeof row> => !!row);
  const selectedEmailCount = selectedRows.filter((row) => {
    const client = clients.find((item) => item.id === row.clientId);
    return canSendToEmail(client?.email);
  }).length;

  function toggleAll(checked: boolean) {
    if (checked) setSelected(new Set(allIds));
    else setSelected(new Set());
  }
  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function openSingle(reminderId: string) {
    const row = [...upcomingRows, ...completedRows].find((r) => r.id === reminderId);
    if (!row) return;
    const p = row.policy;
    const client = clients.find((c) => c.id === row.clientId);
    if (!client || !canSendToEmail(client.email)) return;
    const clientName = `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() || "client";
    const premiumAmount = formatCurrency(p.premium ?? 0);
    const totalCoverage = formatCurrency(p.sumAssured ?? 0);
    const dueDate = formatDate(row.dueDate);
    const vars = {
      "Client Name": clientName, Carrier: p.carrier ?? "", "Policy Name": p.productName ?? "",
      "Policy Number": p.policyNumber ?? "",
      "Total Coverage": totalCoverage,
      "Death Benefit": totalCoverage,
      "Face Amount": totalCoverage,
      "Premium Amount": premiumAmount,
      Date: dueDate,
      "Reminder Stage": row.stageLabel,
    };
    setPayload({
      contextLabel: clientName, to: client.email,
      subject: applyTemplate(renewalTpl.subject, vars),
      body: applyTemplate(renewalTpl.body, vars),
      attachments: renewalTpl.attachments ?? [],
      emphasizedTerms: [p.policyNumber ?? "", premiumAmount, totalCoverage, dueDate],
      clientId: client.id, template: "renewal", policyId: p.id, reminderStage: row.stage, reminderCycleKey: row.cycleKey, reminderDedupeKey: row.dedupeKey,
    });
    setDialogOpen(true);
  }

  function openBulk() {
    const batch = Array.from(selected)
      .map((id) => upcomingRows.find((r) => r.id === id))
      .filter((row): row is NonNullable<typeof row> => !!row)
      .map((row) => {
        const p = row.policy;
        const client = clients.find((c) => c.id === row.clientId);
        if (!client || !canSendToEmail(client.email)) return null;
        const clientName =
          `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() ||
          "client";
        const premiumAmount = formatCurrency(p.premium ?? 0);
        const totalCoverage = formatCurrency(p.sumAssured ?? 0);
        const dueDate = formatDate(row.dueDate);
        const vars = {
          "Client Name": clientName,
          Carrier: p.carrier ?? "",
          "Policy Name": p.productName ?? "",
          "Policy Number": p.policyNumber ?? "",
          "Total Coverage": totalCoverage,
          "Death Benefit": totalCoverage,
          "Face Amount": totalCoverage,
          "Premium Amount": premiumAmount,
          Date: dueDate,
          "Reminder Stage": row.stageLabel,
        };
        return {
          contextLabel: clientName,
          to: client.email,
          subject: applyTemplate(renewalTpl.subject, vars),
          body: applyTemplate(renewalTpl.body, vars),
          variables: vars,
          clientId: client.id,
          template: "renewal" as const,
          policyId: p.id,
          reminderStage: row.stage,
          reminderCycleKey: row.cycleKey,
          reminderDedupeKey: row.dedupeKey,
          emphasizedTerms: [p.policyNumber ?? "", premiumAmount, totalCoverage, dueDate],
        };
      })
      .filter((item): item is NonNullable<typeof item> => !!item);
    if (batch.length === 0) return;
    setPayload({
      contextLabel: `${batch.length} clients`,
      to: "",
      subject: renewalTpl.subject,
      body: renewalTpl.body,
      attachments: renewalTpl.attachments ?? [],
      template: "renewal",
      batch,
    });
    setDialogOpen(true);
  }

  function clearSelection() { setSelected(new Set()); }

  const dismissingReminder = dismissingReminderId
    ? upcomingRows.find((row) => row.id === dismissingReminderId)
    : null;
  const dismissingClient = dismissingReminder
    ? clients.find((client) => client.id === dismissingReminder.clientId)
    : null;

  function handleDismissReminder() {
    if (!dismissingReminder) return;
    const saved = recordEmailReminderSend({
      dedupeKey: dismissingReminder.dedupeKey,
      policyId: dismissingReminder.policy.id,
      clientId: dismissingReminder.clientId,
      type: "premium",
      stage: dismissingReminder.stage,
      cycleKey: dismissingReminder.cycleKey,
      source: "dismissed",
      sentAt: new Date().toISOString(),
    });
    if (!saved) {
      toast.error("Could not remove reminder");
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(dismissingReminder.id);
      return next;
    });
    toast.success("Reminder removed", {
      description: `${dismissingReminder.stageLabel} · #${dismissingReminder.policy.policyNumber}`,
    });
  }

  function handleBulkRemove() {
    if (selectedRows.length === 0) return;
    let removed = 0;
    for (const row of selectedRows) {
      const saved = recordEmailReminderSend({
        dedupeKey: row.dedupeKey,
        policyId: row.policy.id,
        clientId: row.clientId,
        type: "premium",
        stage: row.stage,
        cycleKey: row.cycleKey,
        source: "dismissed",
        sentAt: new Date().toISOString(),
      });
      if (saved) removed += 1;
    }
    setSelected(new Set());
    setBulkRemoveOpen(false);
    if (removed === 0) {
      toast.error("Could not remove selected reminders");
      return;
    }
    toast.success("Selected reminders removed", {
      description: `${removed} reminder${removed === 1 ? "" : "s"} cleared from Upcoming.`,
    });
  }

  return (
    <>
      <WidgetCard
        title="Upcoming Premiums"
        description={`${premiumReminderState.duePolicies.length} policies due in the next ${WINDOW_DAYS} days`}
        bodyFlush
        className="rounded-2xl border-slate-100 shadow-[0_4px_20px_-5px_rgba(15,23,42,0.06)]"
        icon={
          activeTab === "upcoming" && upcomingRows.length > 0 ? (
            <Checkbox aria-label="Select all" checked={allChecked} indeterminate={someChecked} onCheckedChange={(c) => toggleAll(c === true)} />
          ) : null
        }
        action={
          activeTab === "upcoming" && selected.size > 0 ? (
            <div className="flex flex-wrap justify-end gap-2">
              {selectedEmailCount > 0 ? (
                <Button size="sm" className="h-8 bg-navy hover:bg-navy/90 text-white" onClick={openBulk}>
                  <Send className="h-3.5 w-3.5 mr-1.5" />Send Bulk ({selectedEmailCount})
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-rose-100 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                onClick={() => setBulkRemoveOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />Remove Selected ({selected.size})
              </Button>
            </div>
          ) : null
        }
        >
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            setActiveTab(value);
            if (value === "completed") clearSelection();
          }}
          className="w-full"
        >
          <div className="px-5 pb-1.5 md:px-6">
            <TabsList className="h-8 w-auto justify-start rounded-xl border border-slate-100 bg-slate-50/80 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
              <TabsTrigger
                value="upcoming"
                className="h-7 rounded-lg px-3 text-xs font-semibold text-slate-400 transition-colors data-active:bg-white data-active:text-slate-900 data-active:shadow-sm hover:text-slate-600"
              >
                Upcoming{" "}
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                  {upcomingRows.length}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="completed"
                className="h-7 rounded-lg px-3 text-xs font-semibold text-slate-400 transition-colors data-active:bg-white data-active:text-slate-900 data-active:shadow-sm hover:text-slate-600"
              >
                Completed{" "}
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                  {completedRows.length}
                </span>
                {unseenCompletedRows.length > 0 ? (
                  <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                    {unseenCompletedRows.length} new
                  </span>
                ) : null}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="upcoming" className="mt-0">
            {upcomingRows.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title={
                  premiumReminderState.duePolicies.length > 0
                    ? premiumReminderState.dismissedRows.length > 0
                      ? "All active reminders cleared"
                      : "All premium reminders completed"
                    : "No premiums due soon"
                }
                description={
                  premiumReminderState.duePolicies.length > 0
                    ? `${premiumReminderState.duePolicies.length} policies are due in the next ${WINDOW_DAYS} days. ${premiumReminderState.completedRows.length} completed${premiumReminderState.dismissedRows.length > 0 ? ` · ${premiumReminderState.dismissedRows.length} dismissed` : ""}.`
                    : "Nothing scheduled in the next month."
                }
                compact
                className="py-5 [&>div]:bg-slate-50 [&>div_svg]:text-slate-300 [&>h4]:text-slate-600 [&>p]:text-slate-400"
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {upcomingRows.map((row) => {
                  const p = row.policy;
                  const client = clients.find((c) => c.id === row.clientId);
                  const clientName = client ? `${client.firstName} ${client.lastName}` : "—";
                  const canEmail = canSendToEmail(client?.email);
                  const hasPlaceholderEmail = isPlaceholderEmail(client?.email);
                  const isChecked = selected.has(row.id);
                  return (
                    <li
                      key={row.id}
                      className={cn(
                        "flex items-center gap-3 px-5 py-2 md:px-6 transition-colors",
                        isChecked ? "bg-accent-blue/5" : "hover:bg-slate-50/80"
                      )}
                    >
                      <Checkbox aria-label={`Select ${clientName}`} checked={isChecked} onCheckedChange={(c) => toggleOne(row.id, c === true)} />
                      <UniversalDataCard
                        accentColor={CARRIER_COLORS[p.carrier]}
                        className="flex-1 rounded-lg border border-slate-100 bg-white/70 p-3 shadow-none"
                        contentClassName="min-w-0"
                        title={
                          client ? (
                            <Link href={`/policies/${p.id}`}>
                              <ClientNameDisplay
                                firstName={client.firstName}
                                lastName={client.lastName}
                                isVip={calculateClientTags(client, policies).includes("VIP")}
                                size="sm"
                              />
                            </Link>
                          ) : (
                            <span>{clientName}</span>
                          )
                        }
                        subtitle={`${row.stageLabel} · ${row.isJointRecipient ? "Joint Policy · " : ""}${p.carrier} · ${p.productName || p.productType} · #${p.policyNumber} · ${formatCurrency(p.premium)} · ${formatRelative(row.dueDate)}`}
                        badges={
                          p.category === "Investment" && p.isInvestmentLoan ? (
                            <StatusBadge kind="loan" lender={p.lender} />
                          ) : (
                            <StatusBadge kind={p.category === "Investment" ? "investment" : "insurance"} />
                          )
                        }
                        actions={
                          <div className="flex items-center gap-1">
                            {canEmail ? (
                              <button type="button" aria-label={`Email ${clientName}`} onClick={() => openSingle(row.id)}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-accent-blue/10 hover:text-accent-blue">
                                <Mail className="h-4 w-4" />
                              </button>
                            ) : (
                              <span
                                title={hasPlaceholderEmail ? "No real email on file" : "No email on file"}
                                className="inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-lg bg-slate-50 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-300 ring-1 ring-slate-100"
                              >
                                <MailX className="h-3.5 w-3.5" />
                                No Email
                              </span>
                            )}
                            {client ? (
                              <button
                                type="button"
                                aria-label={`Remove reminder for ${clientName}`}
                                onClick={() => setDismissingReminderId(row.id)}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-accent-red/10 hover:text-accent-red"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            ) : null}
                          </div>
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="completed" className="mt-0">
            {completedRows.length === 0 ? (
              <EmptyState
                icon={Mail}
                title="No completed reminders yet"
                description={`No due policies have been contacted in this ${WINDOW_DAYS}-day window.`}
                compact
                className="[&>div]:bg-slate-50 [&>div_svg]:text-slate-300 [&>h4]:text-slate-600 [&>p]:text-slate-400"
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {completedRows.map((row) => {
                  const client = clients.find((c) => c.id === row.clientId);
                  const clientName = client ? `${client.firstName} ${client.lastName}` : "—";
                  const history = findRenewalHistory(row.clientId, row.policy.policyNumber);
                  const isNew = !row.reminderSend?.seenAt;
                  return (
                    <li
                      key={row.id}
                      className={cn(
                        "px-5 py-2 transition-colors md:px-6",
                        isNew && "bg-amber-50/45"
                      )}
                    >
                      <UniversalDataCard
                        accentColor={isNew ? "#D6A84F" : "#CBD5E1"}
                        className={cn(
                          "rounded-lg border p-3 shadow-none transition-colors",
                          isNew
                            ? "border-amber-200 bg-white shadow-[0_8px_24px_-16px_rgba(146,64,14,0.45)]"
                            : "border-slate-100 bg-white/70"
                        )}
                        title={
                          client ? (
                            <Link href={clientPath(client)}>
                              <ClientNameDisplay
                                firstName={client.firstName}
                                lastName={client.lastName}
                                isVip={calculateClientTags(client, policies).includes("VIP")}
                                size="sm"
                              />
                            </Link>
                          ) : (
                            <span>{clientName}</span>
                          )
                        }
                        subtitle={`${row.policy.carrier} · ${row.policy.productName || row.policy.productType} · #${row.policy.policyNumber} · due ${formatDate(row.dueDate)} · completed ${formatRelative(row.completedAt)}`}
                        badges={
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {isNew ? (
                              <StatusBadge
                                kind="custom"
                                label="NEW"
                                className="bg-amber-50 text-amber-700 ring-amber-200"
                              />
                            ) : null}
                            <StatusBadge
                              kind="custom"
                              label={row.stageLabel.toUpperCase()}
                              className="bg-slate-50 text-slate-500 ring-slate-100"
                            />
                          </div>
                        }
                        actions={
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              aria-label={`Preview completed reminder for ${clientName}`}
                              onClick={() =>
                                setSentPreview({
                                  to: client?.email,
                                  date: history?.date ?? row.completedAt,
                                  subject:
                                    history?.subject ??
                                    `Renewal reminder completed · #${row.policy.policyNumber}`,
                                  body:
                                    history?.body ??
                                    `Reminder completed for ${row.policy.carrier} ${row.policy.productName || row.policy.productType} policy #${row.policy.policyNumber}.`,
                                  templateLabel: history?.templateLabel ?? "Renewal Reminder",
                                  policyLabel:
                                    history?.policyLabel ??
                                    `${row.policy.carrier} ${row.policy.productName || row.policy.productType}`.trim(),
                                  policyNumber: history?.policyNumber ?? row.policy.policyNumber,
                                  attachments: history?.attachments,
                                })
                              }
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-accent-blue/10 hover:text-accent-blue"
                            >
                              <Mail className="h-4 w-4" />
                            </button>
                            {canSendToEmail(client?.email) ? (
                              <button
                                type="button"
                                aria-label={`Re-send reminder to ${clientName}`}
                                onClick={() => openSingle(row.id)}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </button>
                            ) : null}
                          </div>
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </WidgetCard>

      <EmailPreviewDialog open={dialogOpen} onOpenChange={setDialogOpen} payload={payload} onSent={clearSelection} />
      <EmailHistoryPreviewDialog
        open={!!sentPreview}
        onOpenChange={(open) => {
          if (!open) setSentPreview(null);
        }}
        email={sentPreview}
      />
      <ConfirmDialog
        open={!!dismissingReminderId}
        onOpenChange={(open) => {
          if (!open) setDismissingReminderId(null);
        }}
        title="Remove this reminder?"
        description={
          <>
            This only removes the current email reminder from Upcoming. It will not delete{" "}
            <span className="font-semibold">
              {dismissingClient
                ? `${dismissingClient.firstName} ${dismissingClient.lastName}`
                : "this client"}
            </span>{" "}
            or policy #{dismissingReminder?.policy.policyNumber}.
          </>
        }
        confirmLabel="Remove Reminder"
        onConfirm={handleDismissReminder}
      />
      <ConfirmDialog
        open={bulkRemoveOpen}
        onOpenChange={setBulkRemoveOpen}
        title="Remove selected reminders?"
        description={
          <>
            This clears <span className="font-semibold">{selected.size}</span>{" "}
            selected email reminder{selected.size === 1 ? "" : "s"} from
            Upcoming. It will not delete any clients or policies.
          </>
        }
        confirmLabel="Remove Selected"
        onConfirm={handleBulkRemove}
      />
    </>
  );
}
