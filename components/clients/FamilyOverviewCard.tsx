"use client";

import { ArrowUpRight, Network, UsersRound } from "lucide-react";
import { WidgetCard } from "@/components/ui-shared/WidgetCard";
import { ClientAvatar } from "@/components/ui-shared/ClientAvatar";
import { ClientNameDisplay } from "@/components/ui-shared/ClientNameDisplay";
import { PolicyDataCard } from "@/components/ui-shared/PolicyDataCard";
import { StatusBadge } from "@/components/ui-shared/StatusBadge";
import { UniversalDataCard } from "@/components/ui-shared/UniversalDataCard";
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
    dot: "#BFDBFE",
    bg: "bg-blue-50/60",
    border: "border-blue-100",
    text: "text-[#002147]",
    ring: "ring-blue-100",
  },
  {
    dot: "#A7F3D0",
    bg: "bg-emerald-50/70",
    border: "border-emerald-100",
    text: "text-emerald-700",
    ring: "ring-emerald-100",
  },
  {
    dot: "#FDE68A",
    bg: "bg-stone-50",
    border: "border-stone-200",
    text: "text-stone-700",
    ring: "ring-stone-200",
  },
  {
    dot: "#DDD6FE",
    bg: "bg-zinc-50",
    border: "border-zinc-200",
    text: "text-zinc-700",
    ring: "ring-zinc-200",
  },
  {
    dot: "#CCFBF1",
    bg: "bg-neutral-50",
    border: "border-neutral-200",
    text: "text-neutral-700",
    ring: "ring-neutral-200",
  },
  {
    dot: "#FECACA",
    bg: "bg-gray-50",
    border: "border-gray-200",
    text: "text-gray-700",
    ring: "ring-gray-200",
  },
] as const;

function ownerBadgeClass(ownerId: string, currentClientId: string) {
  return ownerId === currentClientId
    ? "bg-blue-50 text-[#002147] ring-blue-100 [&_span]:text-[#002147]"
    : "bg-emerald-50 text-emerald-700 ring-emerald-100 [&_span]:text-emerald-700";
}

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
                <UniversalDataCard
                  key={link.relationshipId}
                  href={`/clients/${link.client.id}`}
                  accentColor={toneByClientId.get(link.client.id)?.dot ?? "#CBD5E1"}
                  className={cn(
                    "rounded-xl border p-5 shadow-none",
                    toneByClientId.get(link.client.id)?.bg ?? "bg-slate-50/70",
                    toneByClientId.get(link.client.id)?.border ?? "border-slate-100"
                  )}
                  title={
                    <span className="inline-flex items-center gap-3">
                      <ClientAvatar
                        firstName={link.client.firstName}
                        lastName={link.client.lastName}
                        size="sm"
                      />
                      <ClientNameDisplay
                        firstName={link.client.firstName}
                        lastName={link.client.lastName}
                        isVip={calculateClientTags(link.client, policies).includes("VIP")}
                        size="sm"
                      />
                    </span>
                  }
                  subtitle={`${link.client.email}${link.client.phone ? ` · ${link.client.phone}` : ""}`}
                  badges={
                    <>
                      <StatusBadge kind="custom" label={link.relationship} className="bg-white/80 text-slate-600 ring-slate-100" />
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                    </>
                  }
                />
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
                        ownerBadgeClassName={ownerBadgeClass(policy.owner.id, client.id)}
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
              color: "#4F46E5",
            }))}
            total={summary.totalAum}
          />

          <DistributionList
            title="By Company"
            rows={summary.carrierTotals.map((row) => ({
              label: row.carrier,
              value: row.total,
              color: "#10B981",
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
