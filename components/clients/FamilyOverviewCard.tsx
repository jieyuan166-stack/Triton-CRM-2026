"use client";

import Link from "next/link";
import { ArrowUpRight, Network, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { WidgetCard } from "@/components/ui-shared/WidgetCard";
import { ClientAvatar } from "@/components/ui-shared/ClientAvatar";
import { ClientNameDisplay } from "@/components/ui-shared/ClientNameDisplay";
import { PolicyDataCard } from "@/components/ui-shared/PolicyDataCard";
import { CARRIER_COLORS } from "@/lib/carrier-colors";
import { calculateClientTags } from "@/lib/client-tags";
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
                Family Portfolio{" "}
                <span className="font-semibold text-slate-900">
                  {formatCurrencyCompact(
                    summary.insuranceFaceAmount + summary.investmentAum
                  )}
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
                      <ClientNameDisplay
                        firstName={link.client.firstName}
                        lastName={link.client.lastName}
                        isVip={calculateClientTags(link.client, policies).includes("VIP")}
                        size="sm"
                      />
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
                    <li key={policy.id} className="relative">
                      <PolicyDataCard
                        policy={policy}
                        href={`/policies/${policy.id}`}
                        owner={policy.owner}
                        ownerIsVip={calculateClientTags(policy.owner, policies).includes("VIP")}
                      />
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
              Family Portfolio Summary
            </p>
            <div className="mt-3 grid gap-3">
              <MetricRow
                label="Family Insurance Face Amount"
                value={summary.insuranceFaceAmount}
              />
              <MetricRow
                label="Family Investment AUM"
                value={summary.investmentAum}
              />
            </div>
          </div>

          <DistributionList
            title="Portfolio by Category"
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
          No active portfolio yet
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

function MetricRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold tabular-nums text-slate-950">
        {formatCurrencyCompact(value)}
      </p>
      <p className="mt-0.5 text-[10px] text-slate-400">{formatCurrency(value)}</p>
    </div>
  );
}
