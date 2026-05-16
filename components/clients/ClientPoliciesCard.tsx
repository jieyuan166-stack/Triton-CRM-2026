"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ExternalLink, FileText, Plus, Search } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WidgetCard } from "@/components/ui-shared/WidgetCard";
import { EmptyState } from "@/components/ui-shared/EmptyState";
import { PolicyDataCard } from "@/components/ui-shared/PolicyDataCard";
import { CarrierLogoBadge } from "@/components/ui-shared/CarrierLogoBadge";
import { StatusBadge } from "@/components/ui-shared/StatusBadge";
import { formatDate, formatMonthDay } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/format";
import type { Policy, PolicyCategory, PolicyStatus } from "@/lib/types";
import { CARRIERS, PAYMENT_FREQUENCY_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

const CATEGORY_SECTION_STYLE = {
  Insurance: {
    label: "Insurance Policies",
    description: "Coverage and premium schedule",
    badge: "bg-blue-50 text-blue-700 ring-blue-100",
    row: "hover:bg-blue-50/40",
  },
  Investment: {
    label: "Investment Policies",
    description: "Investment assets and loan details",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    row: "hover:bg-emerald-50/40",
  },
} as const;

interface ClientPoliciesCardProps {
  clientId: string;
  policies: Policy[];
}

const DEFAULT_VISIBLE_COUNT = 5;
type PolicyQuickFilter = "all" | "joint" | "loan" | "corporate" | "pending";

function clusterByCarrier(items: Policy[]) {
  return [...items].sort((a, b) => {
    const carrierOrder = CARRIERS.indexOf(a.carrier) - CARRIERS.indexOf(b.carrier);
    if (carrierOrder !== 0) return carrierOrder;
    return (a.productName || a.productType).localeCompare(b.productName || b.productType);
  });
}

export function ClientPoliciesCard({ clientId, policies }: ClientPoliciesCardProps) {
  const [expandedList, setExpandedList] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | PolicyCategory>("all");
  const [quickFilter, setQuickFilter] = useState<PolicyQuickFilter>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | PolicyStatus>("all");
  const [expandedPolicyIds, setExpandedPolicyIds] = useState<Set<string>>(new Set());

  const filteredPolicies = useMemo(() => {
    const q = query.trim().toLowerCase();
    return policies.filter((policy) => {
      const haystack = [
        policy.policyNumber,
        policy.productName,
        policy.productType,
        policy.carrier,
        policy.category,
        policy.status,
        policy.lender,
        policy.businessName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (q && !haystack.includes(q)) return false;
      if (categoryFilter !== "all" && policy.category !== categoryFilter) return false;
      if (statusFilter !== "all" && policy.status !== statusFilter) return false;
      if (quickFilter === "joint" && !policy.isJoint) return false;
      if (quickFilter === "loan" && !policy.isInvestmentLoan) return false;
      if (quickFilter === "corporate" && !policy.isCorporateInsurance) return false;
      if (quickFilter === "pending" && policy.status !== "pending") return false;
      return true;
    });
  }, [categoryFilter, policies, query, quickFilter, statusFilter]);

  const visiblePolicies = expandedList
    ? filteredPolicies
    : filteredPolicies.slice(0, DEFAULT_VISIBLE_COUNT);
  const hiddenCount = Math.max(filteredPolicies.length - visiblePolicies.length, 0);

  const policySections = useMemo(
    () =>
      (["Insurance", "Investment"] as const)
        .map((category) => ({
          category,
          policies: clusterByCarrier(visiblePolicies.filter((p) => p.category === category)),
          style: CATEGORY_SECTION_STYLE[category],
        }))
        .filter((s) => s.policies.length > 0),
    [visiblePolicies]
  );

  function togglePolicyDetails(id: string) {
    setExpandedPolicyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <WidgetCard
      title="Policies"
      description={`${policies.length} total${filteredPolicies.length !== policies.length ? ` · ${filteredPolicies.length} shown` : ""}`}
      bodyFlush
      action={
        <Link href={`/policies/new?clientId=${clientId}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8")}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Link>
      }
    >
      {policies.length === 0 ? (
        <EmptyState icon={FileText} title="No policies yet" description="Add the first policy for this client." compact />
      ) : (
        <div>
          <div className="border-b border-slate-100 px-5 pb-4 md:px-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-300" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search policy, carrier, number..."
                  className="h-9 pl-9"
                />
              </div>
              <div className="grid grid-cols-3 gap-2 lg:w-[26rem]">
                <Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value as typeof categoryFilter)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="Insurance">Insurance</SelectItem>
                    <SelectItem value="Investment">Investment</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={quickFilter} onValueChange={(value) => setQuickFilter(value as PolicyQuickFilter)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="joint">Joint</SelectItem>
                    <SelectItem value="loan">Loan</SelectItem>
                    <SelectItem value="corporate">Corporate</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="lapsed">Lapsed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {filteredPolicies.length === 0 ? (
            <EmptyState icon={Search} title="No matching policies" description="Try another policy number, carrier, or filter." compact />
          ) : (
        <div className="divide-y divide-slate-100">
          {policySections.map(({ category, policies: sectionPolicies, style }) => (
            <section key={category}>
              <div className="flex items-center justify-between gap-3 bg-slate-50/60 px-5 py-2.5 md:px-6">
                <div className="min-w-0">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{style.label}</h4>
                  <p className="text-[11px] text-slate-400">{style.description}</p>
                </div>
                <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold font-number ring-1", style.badge)}>
                  {sectionPolicies.length}
                </span>
              </div>

              <ul className="divide-y divide-slate-100">
                {sectionPolicies.map((p) => (
                    <li key={p.id}>
                      <CompactPolicyRow
                        policy={p}
                        expanded={expandedPolicyIds.has(p.id)}
                        currentViewClientId={clientId}
                        className={style.row}
                        onToggle={() => togglePolicyDetails(p.id)}
                      />
                    </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
          )}

          {hiddenCount > 0 || expandedList ? (
            <div className="border-t border-slate-100 px-5 py-3 text-center md:px-6">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpandedList((value) => !value)}
              >
                {expandedList ? "Show less" : `View all ${filteredPolicies.length} policies`}
                <ChevronDown
                  className={cn(
                    "ml-1.5 h-3.5 w-3.5 transition-transform",
                    expandedList ? "rotate-180" : ""
                  )}
                />
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </WidgetCard>
  );
}

function CompactPolicyRow({
  policy,
  expanded,
  currentViewClientId,
  className,
  onToggle,
}: {
  policy: Policy;
  expanded: boolean;
  currentViewClientId: string;
  className?: string;
  onToggle: () => void;
}) {
  const primaryAmountLabel =
    policy.category === "Investment" ? "Initial" : "Death Benefit";
  const dateLabel = policy.category === "Investment" ? "Effective" : "Premium";
  const dateValue =
    policy.category === "Investment"
      ? policy.effectiveDate
        ? formatDate(policy.effectiveDate)
        : "—"
      : policy.premiumDate
        ? formatMonthDay(policy.premiumDate)
        : "—";

  return (
    <div className={cn("transition-colors", className)}>
      <div className="grid grid-cols-1 gap-3 px-5 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:px-6">
        <button
          type="button"
          onClick={onToggle}
          className="min-w-0 text-left"
          aria-expanded={expanded}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <CarrierLogoBadge carrier={policy.carrier} size="sm" />
            <span className="text-sm font-medium text-slate-900">
              {policy.productName || policy.productType}
            </span>
            <span className="text-xs text-slate-400">#{policy.policyNumber}</span>
            {policy.isJoint ? <StatusBadge kind="joint" /> : null}
            {policy.category === "Investment" && policy.isInvestmentLoan ? (
              <StatusBadge kind="loan" lender={policy.lender} />
            ) : (
              <StatusBadge kind={policy.category === "Investment" ? "investment" : "insurance"} />
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {policy.carrier} · {policy.productType}
            {policy.status !== "active" ? ` · ${policy.status}` : ""}
          </p>
        </button>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 md:justify-end">
          <Metric label={primaryAmountLabel} value={formatCurrency(policy.sumAssured)} />
          {policy.category !== "Investment" ? (
            <Metric
              label="Premium"
              value={`${formatCurrency(policy.premium)} /${PAYMENT_FREQUENCY_LABELS[policy.paymentFrequency].toLowerCase()}`}
            />
          ) : null}
          <Metric label={dateLabel} value={dateValue} />
          <Link
            href={`/policies/${policy.id}`}
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "text-slate-400 hover:text-[#002147]"
            )}
            aria-label={`Open policy ${policy.policyNumber}`}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-slate-100 bg-slate-50/40 px-5 py-3 md:px-6">
          <PolicyDataCard
            policy={policy}
            href={`/policies/${policy.id}`}
            currentViewClientId={currentViewClientId}
            className="rounded-xl border border-slate-100 bg-white shadow-none"
          />
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[5.5rem]">
      <p className="label-caps leading-none">{label}</p>
      <p className="mt-1 whitespace-nowrap text-xs font-medium text-slate-800">
        {value}
      </p>
    </div>
  );
}
