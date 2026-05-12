// components/clients/ClientPoliciesCard.tsx
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

const STATUS_STYLE: Record<string, string> = {
  active: "bg-accent-green/15 text-emerald-700 border-0",
  pending: "bg-accent-amber/15 text-amber-700 border-0",
  lapsed: "bg-accent-red/15 text-red-700 border-0",
};

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

export function ClientPoliciesCard({
  clientId,
  policies,
}: ClientPoliciesCardProps) {
  const policySections = useMemo(
    () =>
      (["Insurance", "Investment"] as const)
        .map((category) => ({
          category,
          policies: policies.filter((policy) => policy.category === category),
          style: CATEGORY_SECTION_STYLE[category],
        }))
        .filter((section) => section.policies.length > 0),
    [policies]
  );

  return (
    <WidgetCard
      title="Policies"
      description={`${policies.length} total`}
      bodyFlush
      action={
        <Link
          href={`/policies/new?clientId=${clientId}`}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "h-8"
          )}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add
        </Link>
      }
    >
      {policies.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No policies yet"
          description="Add the first policy for this client."
          compact
        />
      ) : (
        <div className="divide-y divide-slate-100">
          {policySections.map(({ category, policies: sectionPolicies, style }) => (
            <section key={category}>
              <div className="flex items-center justify-between gap-3 bg-slate-50/60 px-5 py-2.5 md:px-6">
                <div className="min-w-0">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {style.label}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {style.description}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ring-1",
                    style.badge
                  )}
                >
                  {sectionPolicies.length}
                </span>
              </div>

              <ul className="divide-y divide-slate-100">
                {sectionPolicies.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/policies/${p.id}`}
                      className={cn(
                        "flex items-stretch gap-3 px-5 py-3.5 transition-colors md:px-6",
                        style.row
                      )}
                    >
                      <span
                        className="w-1 self-stretch rounded-full shrink-0"
                        style={{ backgroundColor: CARRIER_COLORS[p.carrier] }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <p className="text-sm font-semibold text-triton-text truncate">
                            {p.productName || p.productType}
                          </p>
                          <div className="flex flex-wrap justify-end gap-1.5 shrink-0">
                            <Badge
                              className={cn(
                                "border-0 text-[10px] font-semibold ring-1",
                                style.badge
                              )}
                            >
                              {p.category}
                            </Badge>
                            {p.category === "Investment" && p.isInvestmentLoan ? (
                              <Badge className="border-0 bg-indigo-100 text-indigo-700">
                                Investment Loan
                              </Badge>
                            ) : null}
                            <Badge className={STATUS_STYLE[p.status]}>
                              {p.status}
                            </Badge>
                          </div>
                        </div>
                        <p className="text-xs text-triton-muted mb-2 truncate">
                          {p.carrier} · {p.productType} · {p.policyNumber}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {p.isCorporateInsurance && p.businessName ? (
                            <p className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 ring-1 ring-slate-200/60">
                              Corporate · {p.businessName}
                            </p>
                          ) : null}
                          {p.category === "Investment" && p.isInvestmentLoan && p.lender ? (
                            <p className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100">
                              Lender · {p.lender}
                            </p>
                          ) : null}
                        </div>
                        <div
                          className={cn(
                            "grid gap-2 text-xs",
                            p.category === "Investment"
                              ? "grid-cols-2"
                              : "grid-cols-3"
                          )}
                        >
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                              {p.category === "Investment"
                                ? "Initial Investment Amount"
                                : "Face Amount"}
                            </p>
                            <p className="font-semibold text-triton-text tabular-nums">
                              {formatCurrency(p.sumAssured)}
                            </p>
                          </div>
                          {p.category === "Investment" ? null : (
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                                Premium
                              </p>
                              <p className="font-semibold text-triton-text tabular-nums">
                                {formatCurrency(p.premium)}
                                <span className="text-triton-muted font-normal">
                                  {" "}
                                  /{PAYMENT_FREQUENCY_LABELS[
                                    p.paymentFrequency
                                  ].toLowerCase()}
                                </span>
                              </p>
                            </div>
                          )}
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                              {p.category === "Investment"
                                ? "Effective Date"
                                : "Premium Date"}
                            </p>
                            <p className="font-semibold text-triton-text tabular-nums">
                              {p.category === "Investment"
                                ? formatDate(p.effectiveDate)
                                : p.premiumDate
                                ? formatMonthDay(p.premiumDate)
                                : "—"}
                            </p>
                            {p.category !== "Investment" && p.premiumDate ? (
                              <p className="text-[10px] text-triton-muted">
                                {formatRelative(p.premiumDate)}
                              </p>
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
