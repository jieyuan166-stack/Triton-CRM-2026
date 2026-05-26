"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import type { Client, FollowUp } from "@/lib/types";
import { clientPath } from "@/lib/client-slug";
import { daysUntil, formatDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

interface FollowUpsDueAlertProps {
  clients: Client[];
  followUps: FollowUp[];
}

function clientName(client?: Client) {
  if (!client) return "Unknown client";
  return (
    `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() ||
    client.companyName ||
    "Client"
  );
}

function isActionable(followUp: FollowUp) {
  if (followUp.completedAt) return false;
  if (followUp.deadline) return daysUntil(followUp.deadline) <= 30;
  return followUp.importance === "High";
}

export function FollowUpsDueAlert({ clients, followUps }: FollowUpsDueAlertProps) {
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const due = followUps
    .filter(isActionable)
    .sort((a, b) => {
      const aDays = a.deadline ? daysUntil(a.deadline) : Number.POSITIVE_INFINITY;
      const bDays = b.deadline ? daysUntil(b.deadline) : Number.POSITIVE_INFINITY;
      if (aDays !== bDays) return aDays - bDays;
      const aHigh = a.importance === "High" ? 0 : 1;
      const bHigh = b.importance === "High" ? 0 : 1;
      if (aHigh !== bHigh) return aHigh - bHigh;
      return a.summary.localeCompare(b.summary);
    });

  if (due.length === 0) return null;

  const overdue = due.filter((followUp) => !!followUp.deadline && daysUntil(followUp.deadline) < 0);
  const today = due.filter((followUp) => !!followUp.deadline && daysUntil(followUp.deadline) === 0);
  const high = due.filter((followUp) => followUp.importance === "High");
  const hasOverdue = overdue.length > 0;
  const nextClient = clientsById.get(due[0]?.clientId ?? "");
  const nextFollowUpHref = nextClient
    ? clientPath(nextClient) + "#activity"
    : "/clients?followUpDue=true&followUpSort=deadline";

  return (
    <div
      className={cn(
        "mb-6 rounded-2xl border px-4 py-4 shadow-sm md:px-5",
        hasOverdue
          ? "border-rose-200 bg-rose-50/80"
          : "border-[#C99A3A]/30 bg-[#C99A3A]/10"
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <div
            className={cn(
              "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1",
              hasOverdue
                ? "bg-rose-100 text-rose-700 ring-rose-200"
                : "bg-[#C99A3A]/15 text-[#7A5618] ring-[#C99A3A]/25"
            )}
          >
            {hasOverdue ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <p
              className={cn(
                "text-sm font-bold uppercase tracking-widest",
                hasOverdue ? "text-rose-800" : "text-navy"
              )}
            >
              Follow-ups Due
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-700">
              {due.length} active follow-up{due.length === 1 ? "" : "s"} need attention
              {overdue.length > 0 ? ` · ${overdue.length} overdue` : ""}
              {today.length > 0 ? ` · ${today.length} due today` : ""}
              {high.length > 0 ? ` · ${high.length} high priority` : ""}.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {due.slice(0, 3).map((followUp) => {
                const client = clientsById.get(followUp.clientId);
                return (
                  <Link
                    key={followUp.id}
                    href={client ? clientPath(client) + "#activity" : "/clients?followUpDue=true&followUpSort=deadline"}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-white"
                  >
                    <span className="truncate">{clientName(client)}</span>
                    {followUp.deadline ? (
                      <span className="shrink-0 text-slate-400">Due {formatDate(followUp.deadline)}</span>
                    ) : (
                      <span className="shrink-0 text-slate-400">{followUp.importance}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
        <Link
          href={nextFollowUpHref}
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-navy px-3 text-sm font-semibold text-white hover:bg-navy/90"
        >
          Open next follow-up
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
