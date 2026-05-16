// components/dashboard/UpcomingPremiums.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, Mail, Send, Trash2 } from "lucide-react";
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
import { formatCurrency } from "@/lib/format";
import { applyTemplate } from "@/lib/templates";
import {
  buildPremiumReminderState,
  PREMIUM_REMINDER_WINDOW_DAYS,
} from "@/lib/premium-reminders";
import { cn } from "@/lib/utils";

const WINDOW_DAYS = PREMIUM_REMINDER_WINDOW_DAYS;

export function UpcomingPremiums() {
  const { policies, clients, deleteClient } = useData();
  const { settings } = useSettings();
  const renewalTpl = settings.templates.find((t) => t.id === "renewal") ?? { subject: "", body: "", attachments: [] };

  const premiumReminderState = useMemo(
    () => buildPremiumReminderState({ policies, clients }),
    [clients, policies]
  );
  const upcomingRows = premiumReminderState.pendingRows;
  const completedRows = premiumReminderState.completedRows;

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
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);

  const allIds = upcomingRows.map((r) => r.id);
  const allChecked = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someChecked = selected.size > 0 && !allChecked;

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
    const row = upcomingRows.find((r) => r.id === reminderId);
    if (!row) return;
    const p = row.policy;
    const client = clients.find((c) => c.id === row.clientId);
    if (!client?.email) return;
    const clientName = `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() || "client";
    const premiumAmount = formatCurrency(p.premium ?? 0);
    const faceAmount = formatCurrency(p.sumAssured ?? 0);
    const dueDate = formatDate(row.dueDate);
    const vars = {
      "Client Name": clientName, Carrier: p.carrier ?? "", "Policy Name": p.productName ?? "",
      "Policy Number": p.policyNumber ?? "",
      "Death Benefit": faceAmount, "Face Amount": faceAmount, "Premium Amount": premiumAmount,
      Date: dueDate,
    };
    setPayload({
      contextLabel: clientName, to: client.email,
      subject: applyTemplate(renewalTpl.subject, vars),
      body: applyTemplate(renewalTpl.body, vars),
      attachments: renewalTpl.attachments ?? [],
      emphasizedTerms: [p.policyNumber ?? "", premiumAmount, faceAmount, dueDate],
      clientId: client.id, template: "renewal", policyId: p.id,
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
        if (!client?.email) return null;
        const clientName =
          `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() ||
          "client";
        const premiumAmount = formatCurrency(p.premium ?? 0);
        const faceAmount = formatCurrency(p.sumAssured ?? 0);
        const dueDate = formatDate(row.dueDate);
        const vars = {
          "Client Name": clientName,
          Carrier: p.carrier ?? "",
          "Policy Name": p.productName ?? "",
          "Policy Number": p.policyNumber ?? "",
          "Death Benefit": faceAmount,
          "Face Amount": faceAmount,
          "Premium Amount": premiumAmount,
          Date: dueDate,
        };
        return {
          contextLabel: clientName,
          to: client.email,
          subject: applyTemplate(renewalTpl.subject, vars),
          body: applyTemplate(renewalTpl.body, vars),
          clientId: client.id,
          template: "renewal" as const,
          policyId: p.id,
          emphasizedTerms: [p.policyNumber ?? "", premiumAmount, faceAmount, dueDate],
        };
      })
      .filter((item): item is NonNullable<typeof item> => !!item);
    if (batch.length === 0) return;
    const first = batch[0];
    setPayload({
      contextLabel: `${batch.length} clients`,
      to: "",
      subject: first.subject,
      body: first.body,
      attachments: renewalTpl.attachments ?? [],
      batch,
    });
    setDialogOpen(true);
  }

  function clearSelection() { setSelected(new Set()); }

  const deletingClient = deletingClientId
    ? clients.find((client) => client.id === deletingClientId)
    : null;

  function handleDeleteClient() {
    if (!deletingClient) return;
    const name = `${deletingClient.firstName} ${deletingClient.lastName}`.trim();
    const ok = deleteClient(deletingClient.id);
    if (!ok) {
      toast.error("Could not delete client");
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      upcomingRows
        .filter((row) => row.clientId === deletingClient.id)
        .forEach((row) => next.delete(row.id));
      return next;
    });
    toast.success("Client deleted", { description: name });
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
            <Button size="sm" className="h-8 bg-navy hover:bg-navy/90 text-white" onClick={openBulk}>
              <Send className="h-3.5 w-3.5 mr-1.5" />Send Bulk ({selected.size})
            </Button>
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
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="upcoming" className="mt-0">
            {upcomingRows.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title={
                  premiumReminderState.duePolicies.length > 0
                    ? "All premium reminders completed"
                    : "No premiums due soon"
                }
                description={
                  premiumReminderState.duePolicies.length > 0
                    ? `${premiumReminderState.duePolicies.length} policies are due in the next ${WINDOW_DAYS} days and all have been contacted.`
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
                  const canEmail = !!client?.email;
                  const isChecked = selected.has(row.id);
                  return (
                    <li
                      key={row.id}
                      className={cn(
                        "flex items-center gap-3 px-5 py-2 md:px-6 transition-colors",
                        isChecked ? "bg-accent-blue/5" : "hover:bg-slate-50/80"
                      )}
                    >
                      <Checkbox aria-label={`Select ${clientName}`} checked={isChecked} onCheckedChange={(c) => toggleOne(row.id, c === true)} disabled={!canEmail} />
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
                        subtitle={`${row.isJointRecipient ? "Joint Policy · " : ""}${p.carrier} · ${p.productName || p.productType} · #${p.policyNumber} · ${formatCurrency(p.premium)} · ${formatRelative(row.dueDate)}`}
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
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-200"><Mail className="h-4 w-4" /></span>
                            )}
                            {client ? (
                              <button
                                type="button"
                                aria-label={`Delete ${clientName}`}
                                onClick={() => setDeletingClientId(client.id)}
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
                  return (
                    <li key={row.id} className="px-5 py-2 md:px-6">
                      <UniversalDataCard
                        accentColor="#CBD5E1"
                        className="rounded-lg border border-slate-100 bg-white/70 p-3 shadow-none"
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
                        badges={<StatusBadge kind="custom" label="COMPLETED" className="bg-slate-50 text-slate-500 ring-slate-100" />}
                        actions={
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
                              })
                            }
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-accent-blue/10 hover:text-accent-blue"
                          >
                            <Mail className="h-4 w-4" />
                          </button>
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
        open={!!deletingClientId}
        onOpenChange={(open) => {
          if (!open) setDeletingClientId(null);
        }}
        title="Are you absolutely sure?"
        description={
          <>
            This action cannot be undone. This will permanently delete{" "}
            <span className="font-semibold">
              {deletingClient
                ? `${deletingClient.firstName} ${deletingClient.lastName}`
                : "this client"}
            </span>{" "}
            and all associated policies, follow-ups, relationships, and client data.
          </>
        }
        confirmLabel="Delete"
        onConfirm={handleDeleteClient}
      />
    </>
  );
}
