"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bell, CalendarDays, ExternalLink } from "lucide-react";
import type { Client, FollowUp } from "@/lib/types";
import { clientPath } from "@/lib/client-slug";
import { daysUntil, formatDate } from "@/lib/date-utils";
import { displayPolicyNumberWithHash } from "@/lib/policy-number";
import { cn } from "@/lib/utils";

interface FollowUpBellProps {
  clients: Client[];
  followUps: FollowUp[];
}

const IMPORTANCE_RANK: Record<string, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
};

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

function statusRank(followUp: FollowUp) {
  if (!followUp.deadline) return followUp.importance === "High" ? 2 : 4;
  const days = daysUntil(followUp.deadline);
  if (days < 0) return 0;
  if (days === 0) return 1;
  if (followUp.importance === "High") return 2;
  return 3;
}

function dueLabel(followUp: FollowUp) {
  if (!followUp.deadline) return followUp.importance === "High" ? "High priority" : "No deadline";
  const days = daysUntil(followUp.deadline);
  if (days < 0) return `Overdue · ${formatDate(followUp.deadline)}`;
  if (days === 0) return "Due today";
  return `Due ${formatDate(followUp.deadline)}`;
}

function sortFollowUps(a: FollowUp, b: FollowUp) {
  const statusDelta = statusRank(a) - statusRank(b);
  if (statusDelta !== 0) return statusDelta;

  const importanceDelta =
    (IMPORTANCE_RANK[a.importance ?? ""] ?? 3) -
    (IMPORTANCE_RANK[b.importance ?? ""] ?? 3);
  if (importanceDelta !== 0) return importanceDelta;

  const aDays = a.deadline ? daysUntil(a.deadline) : Number.POSITIVE_INFINITY;
  const bDays = b.deadline ? daysUntil(b.deadline) : Number.POSITIVE_INFINITY;
  if (aDays !== bDays) return aDays - bDays;

  return a.summary.localeCompare(b.summary);
}

export function FollowUpBell({ clients, followUps }: FollowUpBellProps) {
  const [open, setOpen] = useState(false);
  const clientsById = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients]
  );
  const due = useMemo(
    () => followUps.filter(isActionable).sort(sortFollowUps),
    [followUps]
  );

  const visible = due.slice(0, 8);
  const countLabel = due.length > 99 ? "99+" : String(due.length);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
    >
      <button
        type="button"
        aria-label={due.length > 0 ? `${due.length} follow-ups due` : "No follow-ups due"}
        aria-expanded={open}
        className={cn(
          "relative inline-flex h-10 w-10 items-center justify-center rounded-full border transition",
          due.length > 0
            ? "border-[#C99A3A]/45 bg-[#C99A3A]/10 text-navy hover:bg-[#C99A3A]/15"
            : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-600"
        )}
        onClick={() => setOpen((current) => !current)}
      >
        <Bell className="h-4.5 w-4.5" />
        {due.length > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
            {countLabel}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-40 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-xl ring-1 ring-black/5">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-widest text-navy">
              Follow-up Reminders
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {due.length > 0
                ? `${due.length} active item${due.length === 1 ? "" : "s"} need attention`
                : "No active follow-ups due."}
            </p>
          </div>

          {due.length > 0 ? (
            <div className="max-h-[26rem] overflow-y-auto p-2">
              {visible.map((followUp) => {
                const client = clientsById.get(followUp.clientId);
                const href = client ? `${clientPath(client)}#activity` : "/clients?followUpDue=true&followUpSort=deadline";
                const overdue = !!followUp.deadline && daysUntil(followUp.deadline) < 0;
                const today = !!followUp.deadline && daysUntil(followUp.deadline) === 0;
                return (
                  <Link
                    key={followUp.id}
                    href={href}
                    className="block rounded-xl px-3 py-2.5 transition hover:bg-slate-50"
                    onClick={() => setOpen(false)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-800">
                          {followUp.summary}
                        </p>
                        <p className="mt-1 truncate text-xs font-medium text-slate-500">
                          {clientName(client)}
                        </p>
                      </div>
                      {followUp.importance ? (
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                            followUp.importance === "High"
                              ? "bg-rose-50 text-rose-700"
                              : followUp.importance === "Medium"
                                ? "bg-[#C99A3A]/10 text-[#7A5618]"
                                : "bg-slate-100 text-slate-500"
                          )}
                        >
                          {followUp.importance}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
                          overdue
                            ? "bg-rose-50 text-rose-700"
                            : today
                              ? "bg-amber-50 text-amber-700"
                              : "bg-slate-50 text-slate-500"
                        )}
                      >
                        <CalendarDays className="h-3 w-3" />
                        {dueLabel(followUp)}
                      </span>
                      {followUp.policyNumber ? (
                        <span className="min-w-0 truncate">
                          {displayPolicyNumberWithHash(followUp.policyNumber)}
                          {followUp.policyLabel ? ` · ${followUp.policyLabel}` : ""}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-slate-500">
              You are clear for now.
            </div>
          )}

          <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3">
            <Link
              href="/clients?followUpDue=true&followUpSort=deadline"
              className="inline-flex items-center text-xs font-semibold text-navy hover:text-[#7A5618]"
              onClick={() => setOpen(false)}
            >
              View all follow-ups
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
