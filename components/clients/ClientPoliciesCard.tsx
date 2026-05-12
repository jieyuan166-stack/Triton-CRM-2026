"use client";

import Link from "next/link";
import { useMemo } from "react";
import { FileText, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { WidgetCard } from "@/components/ui-shared/WidgetCard";
import { EmptyState } from "@/components/ui-shared/EmptyState";
import { CARRIER_COLORS } from "@/lib/carrier-colors";
import { formatDate, formatMonthDay, formatRelative } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/format";
import { PAYMENT_FREQUENCY_LABELS, type Policy } from "@/lib/types";
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

const BADGE_CLASS =
  "h-5 border-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 rounded-md leading-none";

function normalizeLenderName(lender?: string | null) {
  return (lender ?? "")
    .replace(/\b(INVESTMENT|BANK|LOAN|CORP|CORPORATION|LTD|LLC|INC)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function PolicyTypeBadge({ policy }: { policy: Policy }) {
  const isLoan = policy.category === "Investment" && !!policy.isInvestmentLoan;
  const lender = normalizeLenderName(policy.lender);
  const label = isLoan
    ? lender
      ? `Loan · ${lender}`
      : "Loan"
    : policy.category;
  const tone =
    policy.category === "Investment"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
      : "bg-blue-50 text-blue-700 ring-blue-100";

  return <Badge className={cn(BADGE_CLASS, tone)}>{label}</Badge>;
}

interface ClientPoliciesCardProps {
  clientId: string;
  policies: Policy[];
}

export function ClientPoliciesCard({ clientId, policies }: ClientPoliciesCardProps) {
  const policySections = useMemo(
    () =>
      (["Insurance", "Investment"] as const)
        .map((category) => ({
          category,
          policies: policies.filter((p) => p.category === category),
          style: CATEGORY_SECTION_STYLE[category],
        }))
        .filter((s) => s.policies.length > 0),
    [policies]
  );

  return (
    <WidgetCard
      title="Policies"
      description={`${policies.length} total`}
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
        <div className="divide-y divide-slate-100">
          {policySections.map(({ category, policies: sectionPolicies, style }) => (
            <section key={category}>
              <div className="flex items-center justify-between gap-3 bg-slate-50/60 px-5 py-2.5 md:px-6">
                <div className="min-w-0">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{style.label}</h4>
                  <p className="text-[11px] text-slate-400">{style.description}</p>
                </div>
                <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ring-1", style.badge)}>
                  {sectionPolicies.length}
                </span>
              </div>

              <ul className="divide-y divide-slate-100">
                {sectionPolicies.map((p) => (
                    <li key={p.id}>
                      <Link href={`/policies/${p.id}`} className={cn("flex items-stretch gap-3 px-5 py-3 transition-colors md:px-6", style.row)}>
                        <span className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: CARRIER_COLORS[p.carrier] }} />
                        <div className="flex-1 min-w-0">
                          <div className="mb-0.5 flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold leading-snug text-triton-text">
                                {p.productName || p.productType}
                              </p>
                              <p className="truncate text-xs leading-snug text-triton-muted">
                                {p.carrier} · {p.productType} · {p.policyNumber}
                              </p>
                            </div>
                            <div className="flex flex-row-reverse flex-wrap items-center gap-2">
                              <PolicyTypeBadge policy={p} />
                              {p.isCorporateInsurance && p.businessName ? (
                                <Badge className={cn(BADGE_CLASS, "bg-slate-100 text-slate-600 ring-slate-200")}>
                                  Corporate
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                          <div className={cn("grid gap-x-4 gap-y-1.5", p.category === "Investment" ? "grid-cols-2" : "grid-cols-3")}>
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium leading-none mb-0.5">
                                {p.category === "Investment" ? "Initial Amount" : "Face Amount"}
                              </p>
                              <p className="text-[13px] font-semibold text-triton-text tabular-nums leading-tight">
                                {formatCurrency(p.sumAssured)}
                              </p>
                            </div>
                            {p.category === "Investment" ? null : (
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium leading-none mb-0.5">Premium</p>
                                <p className="text-[13px] font-semibold text-triton-text tabular-nums leading-tight">
                                  {formatCurrency(p.premium)}
                                  <span className="text-[11px] text-triton-muted font-normal">
                                    /{PAYMENT_FREQUENCY_LABELS[p.paymentFrequency].toLowerCase()}
                                  </span>
                                </p>
                              </div>
                            )}
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium leading-none mb-0.5">
                                {p.category === "Investment" ? "Effective Date" : "Premium Date"}
                              </p>
                              <p className="text-[13px] font-semibold text-triton-text tabular-nums leading-tight">
                                {p.category === "Investment"
                                  ? p.effectiveDate ? formatDate(p.effectiveDate) : "—"
                                  : p.premiumDate ? formatMonthDay(p.premiumDate) : "—"}
                              </p>
                              {p.premiumDate && p.category !== "Investment" ? (
                                <p className="text-[10px] text-triton-muted leading-none">{formatRelative(p.premiumDate)}</p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </Link>
                    </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}
