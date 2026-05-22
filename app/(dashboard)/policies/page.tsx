// app/(dashboard)/policies/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useState, type ElementType } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FileText, LayoutGrid, Plus, Search, Table2, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useData } from "@/components/providers/DataProvider";
import { EmptyState } from "@/components/ui-shared/EmptyState";
import { CarrierLogoBadge } from "@/components/ui-shared/CarrierLogoBadge";
import { PolicyDataCard } from "@/components/ui-shared/PolicyDataCard";
import { StatusBadge } from "@/components/ui-shared/StatusBadge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { calculateClientTags } from "@/lib/client-tags";
import { clientPath } from "@/lib/client-slug";
import { CARRIERS, type Carrier, type Policy, type PolicyCategory } from "@/lib/types";
import { formatDate, formatMonthDay } from "@/lib/date-utils";
import { formatCurrencyShort } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function PoliciesPage() {
  return (
    <Suspense fallback={null}>
      <PoliciesContent />
    </Suspense>
  );
}

function parseCarrier(value: string | null): Carrier | "all" {
  return value && (CARRIERS as readonly string[]).includes(value)
    ? (value as Carrier)
    : "all";
}

function parseView(value: string | null): "cards" | "table" | "client" {
  return value === "table" || value === "client" ? value : "cards";
}

function parseCategory(value: string | null): PolicyCategory | null {
  return value === "Insurance" || value === "Investment" ? value : null;
}

function parseNewMoneyYear(value: string | null): number | null {
  if (!value) return null;
  const year = Number(value);
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null;
}

function parseDateOnly(value: string | undefined): Date | null {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function PoliciesContent() {
  const searchParams = useSearchParams();
  const { policies, getClient, dataStatus, dataError } = useData();
  const carrierFromUrl = parseCarrier(searchParams.get("carrier"));
  const viewFromUrl = parseView(searchParams.get("view"));
  const categoryFromUrl = parseCategory(searchParams.get("category"));
  const newMoneyYear = parseNewMoneyYear(searchParams.get("newMoneyYear"));
  const [view, setView] = useState<"cards" | "table" | "client">(viewFromUrl);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Policy["status"] | "all">("all");
  const [carrierFilter, setCarrierFilter] = useState<Carrier | "all">(carrierFromUrl);

  useEffect(() => {
    setCarrierFilter(carrierFromUrl);
  }, [carrierFromUrl]);

  useEffect(() => {
    setView(viewFromUrl);
  }, [viewFromUrl]);

  const visiblePolicies = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = new Date();
    const newMoneyCutoff = newMoneyYear
      ? new Date(newMoneyYear, today.getMonth(), today.getDate())
      : null;

    return policies.filter((policy) => {
      const client = getClient(policy.clientId);
      const haystack = [
        policy.policyNumber,
        policy.carrier,
        policy.productName,
        policy.productType,
        policy.category,
        policy.status,
        policy.lender,
        policy.policyOwnerName,
        policy.policyOwner2Name,
        client ? `${client.firstName} ${client.lastName}` : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (categoryFromUrl && policy.category !== categoryFromUrl) return false;

      if (newMoneyYear && newMoneyCutoff) {
        const effectiveDate = parseDateOnly(policy.effectiveDate);
        if (!effectiveDate) return false;
        if (policy.status !== "active") return false;
        if (effectiveDate.getFullYear() !== newMoneyYear) return false;
        if (effectiveDate > newMoneyCutoff) return false;
      }

      return (
        (newMoneyYear !== null || statusFilter === "all" || policy.status === statusFilter) &&
        (carrierFilter === "all" || policy.carrier === carrierFilter) &&
        (!q || haystack.includes(q))
      );
    });
  }, [carrierFilter, categoryFromUrl, getClient, newMoneyYear, policies, search, statusFilter]);

  const groupedByClient = useMemo(() => {
    const groups = new Map<
      string,
      {
        client: ReturnType<typeof getClient>;
        policies: Policy[];
        insurance: number;
        investment: number;
      }
    >();

    for (const policy of visiblePolicies) {
      const client = getClient(policy.clientId);
      const group = groups.get(policy.clientId) ?? {
        client,
        policies: [],
        insurance: 0,
        investment: 0,
      };
      group.policies.push(policy);
      if (policy.category === "Investment") {
        group.investment += policy.sumAssured || policy.loanAmount || 0;
      } else {
        group.insurance += policy.sumAssured || 0;
      }
      groups.set(policy.clientId, group);
    }

    return Array.from(groups.values()).sort((a, b) => {
      const an = a.client ? `${a.client.lastName} ${a.client.firstName}` : "";
      const bn = b.client ? `${b.client.lastName} ${b.client.firstName}` : "";
      return an.localeCompare(bn);
    });
  }, [getClient, visiblePolicies]);

  return (
    <>
      <PageHeader
        title="Policies"
        description={
          newMoneyYear && categoryFromUrl && carrierFilter !== "all"
            ? `${newMoneyYear} YTD ${categoryFromUrl === "Investment" ? "new assets" : "first year premium"} · ${carrierFilter}`
            : carrierFilter === "all"
            ? "All policies across your book"
            : `Showing ${carrierFilter} policies`
        }
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Carrier
              </span>
              <Select
                value={carrierFilter}
                onValueChange={(value) =>
                  setCarrierFilter(value as Carrier | "all")
                }
              >
                <SelectTrigger className="h-9 w-[165px] bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Carriers</SelectItem>
                  {CARRIERS.map((carrier) => (
                    <SelectItem key={carrier} value={carrier}>
                      {carrier}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Status
              </span>
              <Select
                value={statusFilter}
                onValueChange={(value) =>
                  setStatusFilter(value as Policy["status"] | "all")
                }
              >
                <SelectTrigger className="h-9 w-[145px] bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="lapsed">Lapsed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Link
              href="/policies/new"
              className={cn(buttonVariants({ size: "sm" }), "bg-navy text-white hover:bg-navy/90")}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Policy
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search policy, client, carrier, number..."
            className="h-9 bg-white pl-9"
          />
        </div>
        <div className="inline-flex rounded-lg bg-slate-50 p-1">
          <ViewButton
            active={view === "cards"}
            icon={LayoutGrid}
            label="Cards"
            onClick={() => setView("cards")}
          />
          <ViewButton
            active={view === "table"}
            icon={Table2}
            label="Table"
            onClick={() => setView("table")}
          />
          <ViewButton
            active={view === "client"}
            icon={Users}
            label="By Client"
            onClick={() => setView("client")}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {dataStatus === "loading" ? (
          <PoliciesListSkeleton view={view} />
        ) : dataStatus === "error" ? (
          <EmptyState
            icon={FileText}
            title="Could not load policies"
            description={dataError ?? "Please refresh the page and try again."}
            action={
              <button
                type="button"
                onClick={() => window.location.reload()}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "bg-white"
                )}
              >
                Refresh
              </button>
            }
          />
        ) : policies.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No policies yet"
            description="Policies will appear here when added to a client."
          />
        ) : visiblePolicies.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No matching policies"
            description="Try another carrier or status filter."
          />
        ) : view === "table" ? (
          <PoliciesTable policies={visiblePolicies} getClient={getClient} />
        ) : view === "client" ? (
          <ClientGroupedPolicies groups={groupedByClient} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {visiblePolicies.map((p) => {
              const client = getClient(p.clientId);
              return (
                <li key={p.id}>
                  <PolicyDataCard
                    policy={p}
                    href={`/policies/${p.id}`}
                    owner={client}
                    ownerIsVip={client ? calculateClientTags(client, policies).includes("VIP") : false}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function PoliciesListSkeleton({ view }: { view: "cards" | "table" | "client" }) {
  if (view === "table") {
    return (
      <div className="overflow-x-auto">
        <div className="min-w-[980px]">
          <div className="grid grid-cols-[1.6fr_1fr_1fr_0.7fr_0.8fr_0.7fr] gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-3 animate-pulse rounded bg-slate-200" />
            ))}
          </div>
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 8 }).map((_, row) => (
              <div key={row} className="grid grid-cols-[1.6fr_1fr_1fr_0.7fr_0.8fr_0.7fr] items-center gap-4 px-5 py-4">
                {Array.from({ length: 6 }).map((__, index) => (
                  <div
                    key={index}
                    className={cn(
                      "h-3 animate-pulse rounded bg-slate-100",
                      index === 0 ? "w-44" : "w-24"
                    )}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {Array.from({ length: view === "client" ? 5 : 8 }).map((_, index) => (
        <div key={index} className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-56 max-w-full animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-80 max-w-full animate-pulse rounded bg-slate-100" />
            </div>
            <div className="h-6 w-24 animate-pulse rounded-full bg-slate-100" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((__, metric) => (
              <div key={metric} className="space-y-2">
                <div className="h-2.5 w-20 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ViewButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors",
        active
          ? "bg-card text-navy shadow-sm"
          : "text-slate-500 hover:text-slate-800"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function policyAmount(policy: Policy) {
  return policy.category === "Investment"
    ? policy.sumAssured || policy.loanAmount || 0
    : policy.sumAssured || 0;
}

function policyDate(policy: Policy) {
  if (policy.category === "Investment") {
    return policy.effectiveDate ? formatDate(policy.effectiveDate) : "—";
  }
  return policy.premiumDate ? formatMonthDay(policy.premiumDate) : "—";
}

function PoliciesTable({
  policies,
  getClient,
}: {
  policies: Policy[];
  getClient: ReturnType<typeof useData>["getClient"];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="bg-slate-50/70 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          <tr>
            <th className="px-5 py-3">Policy</th>
            <th className="px-4 py-3">Client</th>
            <th className="px-4 py-3">Carrier</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Amount</th>
            <th className="px-4 py-3">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {policies.map((policy) => {
            const client = getClient(policy.clientId);
            return (
              <tr key={policy.id} className="transition-colors hover:bg-slate-50">
                <td className="px-5 py-3">
                  <Link href={`/policies/${policy.id}`} className="font-medium text-slate-900 hover:text-[#8A641E]">
                    {policy.productName || policy.productType}
                  </Link>
                  <p className="mt-0.5 text-xs text-slate-500">
                    #{policy.policyNumber || "—"} · {policy.productType}
                  </p>
                </td>
                <td className="px-4 py-3">
                  {client ? (
                    <Link href={clientPath(client)} className="text-sm font-medium text-navy hover:underline">
                      {client.firstName} {client.lastName}
                    </Link>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2">
                    <CarrierLogoBadge carrier={policy.carrier} size="sm" />
                    <span className="font-medium text-slate-700">{policy.carrier}</span>
                  </span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge
                    kind="custom"
                    label={policy.status.toUpperCase()}
                    className="bg-slate-50 text-slate-600 ring-slate-100"
                  />
                </td>
                <td className="px-4 py-3 text-right font-finance font-semibold text-slate-900">
                  {formatCurrencyShort(policyAmount(policy))}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {policyDate(policy)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ClientGroupedPolicies({
  groups,
}: {
  groups: Array<{
    client: ReturnType<ReturnType<typeof useData>["getClient"]>;
    policies: Policy[];
    insurance: number;
    investment: number;
  }>;
}) {
  return (
    <div className="divide-y divide-slate-100">
      {groups.map((group) => {
        const client = group.client;
        const title = client
          ? `${client.firstName} ${client.lastName}`
          : "Unknown client";
        return (
          <div key={client?.id ?? title} className="p-5">
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                {client ? (
                  <Link href={clientPath(client)} className="text-sm font-bold text-navy hover:underline">
                    {title}
                  </Link>
                ) : (
                  <p className="text-sm font-bold text-slate-700">{title}</p>
                )}
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {group.policies.length} policies
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-right">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Insurance
                  </p>
                  <p className="font-finance text-sm font-bold text-slate-900">
                    {formatCurrencyShort(group.insurance)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Investment
                  </p>
                  <p className="font-finance text-sm font-bold text-slate-900">
                    {formatCurrencyShort(group.investment)}
                  </p>
                </div>
              </div>
            </div>
            <div className="grid gap-2">
              {group.policies.map((policy) => (
                <Link
                  key={policy.id}
                  href={`/policies/${policy.id}`}
                  className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/40 px-3 py-2 transition-colors hover:bg-white md:flex-row md:items-center md:justify-between"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-900">
                      {policy.productName || policy.productType}
                    </span>
                    <span className="text-xs text-slate-500">
                      {policy.carrier} · #{policy.policyNumber || "—"}
                    </span>
                  </span>
                  <span className="font-finance text-sm font-semibold text-slate-900">
                    {formatCurrencyShort(policyAmount(policy))}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
