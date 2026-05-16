// components/dashboard/UpcomingPremiums.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, Mail, Send } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useData } from "@/components/providers/DataProvider";
import { useSettings } from "@/components/providers/SettingsProvider";
import { WidgetCard } from "@/components/ui-shared/WidgetCard";
import { EmptyState } from "@/components/ui-shared/EmptyState";
import { ClientNameDisplay } from "@/components/ui-shared/ClientNameDisplay";
import { UniversalDataCard } from "@/components/ui-shared/UniversalDataCard";
import { StatusBadge } from "@/components/ui-shared/StatusBadge";
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
import {
  daysUntil,
  formatDate,
  formatRelative,
  resolveRecurringDate,
} from "@/lib/date-utils";
import { formatCurrency } from "@/lib/format";
import { applyTemplate } from "@/lib/templates";
import { cn } from "@/lib/utils";

const WINDOW_DAYS = 30;
const RENEWAL_SUPPRESSION_DAYS = 30;
const LOOKBACK_DAYS = 7;
const MAX_SENT = 5;

function resolvePremiumReminderDate(input: string, today = new Date()) {
  const parts = /^(\d{2})-(\d{2})$/.exec(input) ?? /^\d{4}-(\d{2})-(\d{2})/.exec(input);
  if (!parts) return resolveRecurringDate(input, today);

  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let target = new Date(today.getFullYear(), month - 1, day);
  if (target < todayStart) {
    target = new Date(today.getFullYear() + 1, month - 1, day);
  }
  return [
    target.getFullYear(),
    String(target.getMonth() + 1).padStart(2, "0"),
    String(target.getDate()).padStart(2, "0"),
  ].join("-");
}

export function UpcomingPremiums() {
  const { policies, clients } = useData();
  const { settings } = useSettings();
  const renewalTpl = settings.templates.find((t) => t.id === "renewal") ?? { subject: "", body: "", attachments: [] };

  const now = Date.now();
  const upcomingRows = useMemo(
    () =>
      policies
        .filter((p) => {
          if (p.status !== "active" || !p.premiumDate) return false;
          const d = daysUntil(p.premiumDate);
          if (d < 0 || d > WINDOW_DAYS) return false;
          if (p.lastRenewalEmailAt) {
            const sinceDays = (now - new Date(p.lastRenewalEmailAt).getTime()) / (1000 * 60 * 60 * 24);
            if (sinceDays >= 0 && sinceDays < RENEWAL_SUPPRESSION_DAYS) return false;
          }
          return true;
        })
        .sort((a, b) => (a.premiumDate! < b.premiumDate! ? -1 : 1))
        .slice(0, 8),
    [policies, now]
  );

  // Sent: renewal emails from emailHistory (lookback 7 days)
  const sentRows = useMemo(() => {
    const cutoff = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
    const entries: {
      id: string;
      clientId: string;
      date: string;
      subject: string;
      body: string;
      templateLabel?: string;
    }[] = [];
    clients.forEach((c) => {
      (c.emailHistory ?? []).forEach((e) => {
        const label = e.templateLabel?.toLowerCase() ?? "";
        const subject = e.subject?.toLowerCase() ?? "";
        const isRenewal = label.includes("renewal") || subject.includes("renewal") || subject.includes("premium") || subject.includes("reminder");
        if (!isRenewal) return;
        const t = new Date(e.date).getTime();
        if (Number.isNaN(t) || t < cutoff) return;
        entries.push({
          id: e.id,
          clientId: c.id,
          date: e.date,
          subject: e.subject,
          body: e.body,
          templateLabel: e.templateLabel,
        });
      });
    });
    return entries
      .sort((a, b) => (a.date > b.date ? -1 : 1))
      .slice(0, MAX_SENT);
  }, [clients]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("upcoming");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [payload, setPayload] = useState<EmailPreviewPayload | null>(null);
  const [sentPreview, setSentPreview] = useState<EmailHistoryPreview | null>(null);

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

  function openSingle(policyId: string) {
    const p = upcomingRows.find((r) => r.id === policyId);
    if (!p) return;
    const client = clients.find((c) => c.id === p.clientId);
    if (!client?.email) return;
    const clientName = `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() || "client";
    const premiumAmount = formatCurrency(p.premium ?? 0);
    const faceAmount = formatCurrency(p.sumAssured ?? 0);
    const dueDate = p.premiumDate
      ? formatDate(resolvePremiumReminderDate(p.premiumDate))
      : "";
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
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => {
        const client = clients.find((c) => c.id === p.clientId);
        if (!client?.email) return null;
        const clientName =
          `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() ||
          "client";
        const premiumAmount = formatCurrency(p.premium ?? 0);
        const faceAmount = formatCurrency(p.sumAssured ?? 0);
        const dueDate = p.premiumDate
          ? formatDate(resolvePremiumReminderDate(p.premiumDate))
          : "";
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

  return (
    <>
      <WidgetCard
        title="Upcoming Premiums"
        description={`Due in the next ${WINDOW_DAYS} days`}
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
            if (value === "sent") clearSelection();
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
                value="sent"
                className="h-7 rounded-lg px-3 text-xs font-semibold text-slate-400 transition-colors data-active:bg-white data-active:text-slate-900 data-active:shadow-sm hover:text-slate-600"
              >
                Sent{" "}
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                  {sentRows.length}
                </span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="upcoming" className="mt-0">
            {upcomingRows.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="No premiums due soon"
                description="Nothing scheduled in the next month."
                compact
                className="[&>div]:bg-slate-50 [&>div_svg]:text-slate-300 [&>h4]:text-slate-600 [&>p]:text-slate-400"
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {upcomingRows.map((p) => {
                  const client = clients.find((c) => c.id === p.clientId);
                  const clientName = client ? `${client.firstName} ${client.lastName}` : "—";
                  const canEmail = !!client?.email;
                  const isChecked = selected.has(p.id);
                  return (
                    <li
                      key={p.id}
                      className={cn(
                        "flex items-center gap-3 px-5 py-2 md:px-6 transition-colors",
                        isChecked ? "bg-accent-blue/5" : "hover:bg-slate-50/80"
                      )}
                    >
                      <Checkbox aria-label={`Select ${clientName}`} checked={isChecked} onCheckedChange={(c) => toggleOne(p.id, c === true)} disabled={!canEmail} />
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
                        subtitle={`${p.carrier} · ${p.productName || p.productType} · #${p.policyNumber} · ${formatCurrency(p.premium)} · ${formatRelative(p.premiumDate!)}`}
                        badges={
                          p.category === "Investment" && p.isInvestmentLoan ? (
                            <StatusBadge kind="loan" lender={p.lender} />
                          ) : (
                            <StatusBadge kind={p.category === "Investment" ? "investment" : "insurance"} />
                          )
                        }
                        actions={
                          canEmail ? (
                            <button type="button" aria-label={`Email ${clientName}`} onClick={() => openSingle(p.id)}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-accent-blue/10 hover:text-accent-blue">
                              <Mail className="h-4 w-4" />
                            </button>
                          ) : (
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-200"><Mail className="h-4 w-4" /></span>
                          )
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="sent" className="mt-0">
            {sentRows.length === 0 ? (
              <EmptyState
                icon={Mail}
                title="No sent emails yet"
                description={`No renewal reminders sent in the last ${LOOKBACK_DAYS} days.`}
                compact
                className="[&>div]:bg-slate-50 [&>div_svg]:text-slate-300 [&>h4]:text-slate-600 [&>p]:text-slate-400"
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {sentRows.map((row) => {
                  const client = clients.find((c) => c.id === row.clientId);
                  const clientName = client ? `${client.firstName} ${client.lastName}` : "—";
                  return (
                    <li key={`${row.clientId}-${row.date}`} className="px-5 py-2 md:px-6">
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
                        subtitle={`${row.templateLabel || row.subject} · ${formatRelative(row.date)}`}
                        badges={<StatusBadge kind="custom" label="SENT" className="bg-slate-50 text-slate-500 ring-slate-100" />}
                        actions={
                          <button
                            type="button"
                            aria-label={`Preview sent email for ${clientName}`}
                            onClick={() =>
                              setSentPreview({
                                to: client?.email,
                                date: row.date,
                                subject: row.subject,
                                body: row.body,
                                templateLabel: row.templateLabel,
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
    </>
  );
}
