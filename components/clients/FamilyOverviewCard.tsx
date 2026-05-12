"use client";

import Link from "next/link";
import { ArrowUpRight, Network, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { WidgetCard } from "@/components/ui-shared/WidgetCard";
import { ClientAvatar } from "@/components/ui-shared/ClientAvatar";
import { CARRIER_COLORS } from "@/lib/carrier-colors";
import { buildFamilySummary } from "@/lib/family";
import { formatCurrency, formatCurrencyCompact } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Client, ClientRelationship, Policy } from "@/lib/types";

interface FamilyOverviewCardProps {
  client: Client;
  clients: Client[];
  policies: Policy[];
  relationships: ClientRelationship[];
}

const CATEGORY_TONE: Record<string, string> = {
  Insurance: "bg-blue-50 text-blue-700 ring-blue-100",
  Investment: "bg-emerald-50 text-emerald-700 ring-emerald-100",
};

const MEMBER_TONES = [
  {
    dot: "#334155",
    bg: "bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-700",
    ring: "ring-slate-200",
  },
  {
    dot: "#9F1239",
    bg: "bg-rose-50",
    border: "border-rose-100",
    text: "text-rose-800",
    ring: "ring-rose-100",
  },
  {
    dot: "#92400E",
    bg: "bg-stone-50",
    border: "border-stone-200",
    text: "text-stone-700",
    ring: "ring-stone-200",
  },
  {
    dot: "#5B21B6",
    bg: "bg-zinc-50",
    border: "border-zinc-200",
    text: "text-zinc-700",
    ring: "ring-zinc-200",
  },
  {
    dot: "#0F766E",
    bg: "bg-neutral-50",
    border: "border-neutral-200",
    text: "text-neutral-700",
    ring: "ring-neutral-200",
  },
  {
    dot: "#7F1D1D",
    bg: "bg-gray-50",
    border: "border-gray-200",
    text: "text-gray-700",
    ring: "ring-gray-200",
  },
] as const;

export function FamilyOverviewCard({
  client,
  clients,
  policies,
  relationships,
}: FamilyOverviewCardProps) {
  const summary = buildFamilySummary(client, clients, policies, relationships);
  const familyMembers = [
    client,
    ...summary.linkedClients.map((link) => link.client),
  ];
  const toneByClientId = new Map(
    familyMembers.map((member, index) => [
      member.id,
      MEMBER_TONES[index % MEMBER_TONES.length],
    ])
  );

  if (summary.linkedClients.length === 0) return null;

  return (
    <WidgetCard
      title="Family Overview"
      description={`${summary.linkedClients.length} linked client${summary.linkedClients.length === 1 ? "" : "s"}`}
      icon={<UsersRound className="h-4 w-4 text-slate-400" />}
      className="overflow-hidden"
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Linked Clients
              </h4>
              <p className="text-xs text-slate-500">
                Family AUM{" "}
                <span className="font-semibold text-slate-900">
                  {formatCurrencyCompact(summary.totalAum)}
                </span>
              </p>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {summary.linkedClients.map((link) => (
                <Link
                  key={link.relationshipId}
                  href={`/clients/${link.client.id}`}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl border px-3 py-3 transition-colors hover:bg-white",
                    toneByClientId.get(link.client.id)?.bg ?? "bg-slate-50/70",
                    toneByClientId.get(link.client.id)?.border ??
                      "border-slate-100"
                  )}
                >
                  <span
                    className="h-9 w-1 rounded-full"
                    style={{
                      backgroundColor:
                        toneByClientId.get(link.client.id)?.dot ?? "#94A3B8",
                    }}
                  />
                  <ClientAvatar
                    firstName={link.client.firstName}
                    lastName={link.client.lastName}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {link.client.firstName} {link.client.lastName}
                      </p>
                      <Badge className="shrink-0 border-0 bg-slate-100 text-[10px] font-medium text-slate-600">
                        {link.relationship}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      {link.client.email}
                      {link.client.phone ? ` · ${link.client.phone}` : ""}
                    </p>
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" />
                </Link>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Family Products
              </h4>
              <span className="text-xs text-slate-500">
                {summary.policies.length} total
              </span>
            </div>
            {summary.policies.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center">
                <Network className="mx-auto h-5 w-5 text-slate-300" />
                <p className="mt-2 text-sm font-medium text-slate-600">
                  No family products yet
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-100 bg-white">
                <ul className="divide-y divide-slate-100">
                  {summary.policies.slice(0, 8).map((policy) => (
                    <li key={policy.id} className="relative bg-white">
                      <Link
                        href={`/policies/${policy.id}`}
                        className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-slate-50"
                      >
                        <span
                          className="h-12 w-1.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              toneByClientId.get(policy.owner.id)?.dot ??
                              CARRIER_COLORS[policy.carrier] ??
                              "#94A3B8",
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-1.5">
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1",
                                toneByClientId.get(policy.owner.id)?.bg ??
                                  "bg-slate-50",
                                toneByClientId.get(policy.owner.id)?.text ??
                                  "text-slate-700",
                                toneByClientId.get(policy.owner.id)?.ring ??
                                  "ring-slate-100"
                              )}
                            >
                              {policy.owner.firstName} {policy.owner.lastName}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {policy.carrier}
                            </span>
                          </div>
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {policy.productName || policy.productType}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {policy.productType} · {policy.policyNumber}
                          </p>
                        </div>
                        <div className="text-right">
                          <Badge
                            className={cn(
                              "mb-1 border-0 text-[10px] ring-1",
                              CATEGORY_TONE[policy.category] ??
                                "bg-slate-50 text-slate-600 ring-slate-100"
                            )}
                          >
                            {policy.category}
                          </Badge>
                          <p className="text-xs font-semibold tabular-nums text-slate-900">
                            {formatCurrency(policy.sumAssured)}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
                {summary.policies.length > 8 ? (
                  <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-2 text-xs text-slate-500">
                    Showing latest 8 of {summary.policies.length} family products.
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4 rounded-2xl bg-slate-50/70 p-4 ring-1 ring-slate-100">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Total Family AUM
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-950">
              {formatCurrencyCompact(summary.totalAum)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {formatCurrency(summary.totalAum)} across active family policies
            </p>
          </div>

          <DistributionList
            title="By Category"
            rows={summary.categoryTotals.map((row) => ({
              label: row.category,
              value: row.total,
              color: row.category === "Investment" ? "#10B981" : "#3B82F6",
            }))}
            total={summary.totalAum}
          />

          <DistributionList
            title="By Company"
            rows={summary.carrierTotals.map((row) => ({
              label: row.carrier,
              value: row.total,
              color: CARRIER_COLORS[row.carrier] ?? "#94A3B8",
            }))}
            total={summary.totalAum}
          />
        </aside>
      </div>
    </WidgetCard>
  );
}

function DistributionList({
  title,
  rows,
  total,
}: {
  title: string;
  rows: Array<{ label: string; value: number; color: string }>;
  total: number;
}) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </h4>
      {rows.length === 0 ? (
        <p className="rounded-lg bg-white px-3 py-2 text-xs text-slate-500">
          No active AUM yet
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const percent = total > 0 ? Math.max((row.value / total) * 100, 2) : 0;
            return (
              <div key={row.label} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-slate-700">{row.label}</span>
                  <span className="tabular-nums text-slate-500">
                    {formatCurrencyCompact(row.value)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${percent}%`, backgroundColor: row.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
