// components/dashboard/UpcomingBirthdays.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Cake, Mail, Send } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useData } from "@/components/providers/DataProvider";
import { useSettings } from "@/components/providers/SettingsProvider";
import { WidgetCard } from "@/components/ui-shared/WidgetCard";
import { EmptyState } from "@/components/ui-shared/EmptyState";
import { ClientAvatar } from "@/components/ui-shared/ClientAvatar";
import { ClientNameDisplay } from "@/components/ui-shared/ClientNameDisplay";
import { UniversalDataCard } from "@/components/ui-shared/UniversalDataCard";
import { StatusBadge } from "@/components/ui-shared/StatusBadge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  EmailPreviewDialog,
  type EmailPreviewPayload,
} from "@/components/dashboard/EmailPreviewDialog";
import { clientPath } from "@/lib/client-slug";
import { calcAge, formatDate, formatRelative } from "@/lib/date-utils";
import { calculateClientTags } from "@/lib/client-tags";
import { applyTemplate } from "@/lib/templates";
import { cn } from "@/lib/utils";

const WINDOW_DAYS = 7;
const BIRTHDAY_SUPPRESSION_DAYS = 30;
const LOOKBACK_DAYS = 7;
const MAX_SENT = 5;

function daysUntilNextBirthday(birthday: string, today: Date = new Date()): number {
  const b = new Date(birthday);
  const next = new Date(today.getFullYear(), b.getMonth(), b.getDate());
  if (next < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
    next.setFullYear(today.getFullYear() + 1);
  }
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((next.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
}

export function UpcomingBirthdays() {
  const { clients, policies } = useData();
  const { settings } = useSettings();
  const birthdayTpl = settings.templates.find((t) => t.id === "birthday") ?? { subject: "", body: "", attachments: [] };

  const now = Date.now();
  const upcomingRows = useMemo(
    () =>
      clients
        .filter((c) => !!c.birthday)
        .map((c) => ({ client: c, daysAway: daysUntilNextBirthday(c.birthday!), age: calcAge(c.birthday!) }))
        .filter((r) => {
          if (r.daysAway < 0 || r.daysAway > WINDOW_DAYS) return false;
          if (r.client.lastBirthdayEmailAt) {
            const sinceDays = (now - new Date(r.client.lastBirthdayEmailAt).getTime()) / (1000 * 60 * 60 * 24);
            if (sinceDays >= 0 && sinceDays < BIRTHDAY_SUPPRESSION_DAYS) return false;
          }
          return true;
        })
        .sort((a, b) => a.daysAway - b.daysAway)
        .slice(0, 8),
    [clients, now]
  );

  // Sent: birthday emails from emailHistory (lookback 7 days)
  const sentRows = useMemo(() => {
    const cutoff = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
    const entries: { clientId: string; date: string; subject: string }[] = [];
    clients.forEach((c) => {
      (c.emailHistory ?? []).forEach((e) => {
        const label = e.templateLabel?.toLowerCase() ?? "";
        const subject = e.subject?.toLowerCase() ?? "";
        const isBirthday = label.includes("birthday") || subject.includes("birthday");
        if (!isBirthday) return;
        const t = new Date(e.date).getTime();
        if (Number.isNaN(t) || t < cutoff) return;
        entries.push({ clientId: c.id, date: e.date, subject: e.subject });
      });
    });
    return entries.sort((a, b) => (a.date > b.date ? -1 : 1)).slice(0, MAX_SENT);
  }, [clients]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("upcoming");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [payload, setPayload] = useState<EmailPreviewPayload | null>(null);

  const allIds = upcomingRows.map((r) => r.client.id);
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

  function openSingle(clientId: string) {
    const row = upcomingRows.find((r) => r.client.id === clientId);
    if (!row?.client?.email) return;
    const clientName = `${row.client.firstName ?? ""} ${row.client.lastName ?? ""}`.trim() || "client";
    const vars = { "Client Name": clientName, Date: row.client.birthday ? formatDate(row.client.birthday) : "" };
    setPayload({
      contextLabel: clientName, to: row.client.email,
      subject: applyTemplate(birthdayTpl.subject, vars),
      body: applyTemplate(birthdayTpl.body, vars),
      attachments: birthdayTpl.attachments ?? [],
      clientId: row.client.id, template: "birthday",
    });
    setDialogOpen(true);
  }

  function openBulk() {
    const batch = upcomingRows
      .filter((r) => selected.has(r.client.id))
      .map((row) => {
        if (!row.client.email) return null;
        const clientName =
          `${row.client.firstName ?? ""} ${row.client.lastName ?? ""}`.trim() ||
          "client";
        const vars = {
          "Client Name": clientName,
          Date: row.client.birthday ? formatDate(row.client.birthday) : "",
        };
        return {
          contextLabel: clientName,
          to: row.client.email,
          subject: applyTemplate(birthdayTpl.subject, vars),
          body: applyTemplate(birthdayTpl.body, vars),
          clientId: row.client.id,
          template: "birthday" as const,
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
      attachments: birthdayTpl.attachments ?? [],
      batch,
    });
    setDialogOpen(true);
  }

  function clearSelection() { setSelected(new Set()); }

  return (
    <>
      <WidgetCard
        title="Upcoming Birthdays"
        description={`In the next ${WINDOW_DAYS} days`}
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
                icon={Cake}
                title="No upcoming birthdays"
                description={`Nothing in the next ${WINDOW_DAYS} days.`}
                compact
                className="[&>div]:bg-slate-50 [&>div_svg]:text-slate-300 [&>h4]:text-slate-600 [&>p]:text-slate-400"
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {upcomingRows.map(({ client, daysAway, age }) => {
                  const turning = age + (daysAway === 0 ? 0 : 1);
                  const clientName = `${client.firstName} ${client.lastName}`;
                  const canEmail = !!client.email;
                  const isChecked = selected.has(client.id);
                  return (
                    <li
                      key={client.id}
                      className={cn(
                        "flex items-center gap-3 px-5 py-2 md:px-6 transition-colors",
                        isChecked ? "bg-accent-blue/5" : "hover:bg-slate-50/80"
                      )}
                    >
                      <Checkbox aria-label={`Select ${clientName}`} checked={isChecked} onCheckedChange={(c) => toggleOne(client.id, c === true)} disabled={!canEmail} />
                      <UniversalDataCard
                        accentColor={daysAway <= 7 ? "#F59E0B" : "#CBD5E1"}
                        className="flex-1 rounded-lg border border-slate-100 bg-white/70 p-3 shadow-none"
                        title={
                          <Link href={clientPath(client)} className="inline-flex items-center gap-2">
                            <ClientAvatar firstName={client.firstName} lastName={client.lastName} size="sm" />
                            <ClientNameDisplay
                              firstName={client.firstName}
                              lastName={client.lastName}
                              isVip={calculateClientTags(client, policies).includes("VIP")}
                              size="sm"
                            />
                          </Link>
                        }
                        subtitle={`Turning ${turning} · ${daysAway === 0 ? "Today" : daysAway === 1 ? "Tomorrow" : `${daysAway}d away`}`}
                        badges={<StatusBadge kind="custom" label="BIRTHDAY" className="bg-amber-50 text-amber-700 ring-amber-100" />}
                        actions={
                          canEmail ? (
                            <button type="button" aria-label={`Email ${clientName}`} onClick={() => openSingle(client.id)}
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
                description={`No birthday greetings sent in the last ${LOOKBACK_DAYS} days.`}
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
                          <Link href={client ? clientPath(client) : `/clients/${row.clientId}`} className="inline-flex items-center gap-2">
                            <ClientAvatar firstName={client?.firstName ?? "?"} lastName={client?.lastName ?? "?"} size="sm" />
                            {client ? (
                              <ClientNameDisplay
                                firstName={client.firstName}
                                lastName={client.lastName}
                                isVip={calculateClientTags(client, policies).includes("VIP")}
                                size="sm"
                              />
                            ) : (
                              <span>{clientName}</span>
                            )}
                          </Link>
                        }
                        subtitle={`${row.subject} · ${formatRelative(row.date)}`}
                        badges={<StatusBadge kind="custom" label="SENT" className="bg-slate-50 text-slate-500 ring-slate-100" />}
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
    </>
  );
}
