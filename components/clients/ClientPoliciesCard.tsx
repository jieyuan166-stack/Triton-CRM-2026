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
  "h-5 border-0 px-2 py-0.5 text-[10px] font-semibold tracking-wider ring-1 rounded-md leading-none";

function displayLenderName(lender?: string | null) {
  const value = (lender ?? "").trim();
  const normalized = value.toLowerCase();

  if (normalized === "b2b bank") return "B2B Bank";
  if (normalized === "ia loan") return "iA Loan";
  return value;
}

function lenderTone(lender?: string | null) {
  const normalized = (lender ?? "").trim().toLowerCase();

  if (normalized === "manulife bank") return "bg-emerald-100 text-emerald-700 ring-emerald-200";
  if (normalized === "b2b bank") return "bg-amber-100 text-amber-800 ring-amber-200";
  if (normalized === "ia loan") return "bg-blue-100 text-blue-700 ring-blue-200";
  if (normalized === "national bank") return "bg-red-50 text-red-600 ring-red-100";
  return "bg-emerald-50 text-emerald-700 ring-emerald-100";
}

function PolicyTypeBadge({ policy }: { policy: Policy }) {
  const isLoan = policy.category === "Investment" && !!policy.isInvestmentLoan;
  const lender = displayLenderName(policy.lender);
  const label = isLoan
    ? lender
      ? `LOAN · ${lender}`
      : "LOAN"
    : policy.category.toUpperCase();
  const tone =
    isLoan
      ? lenderTone(policy.lender)
      : policy.category === "Investment"
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
                      <Link
                        href={`/policies/${p.id}`}
                        className={cn("block border-l-2 p-5 transition-colors", style.row)}
                        style={{ borderLeftColor: CARRIER_COLORS[p.carrier] }}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium leading-snug text-triton-text">
                                {p.productName || p.productType}
                              </p>
                              <p className="mt-1 text-xs leading-snug text-slate-500">
                                {p.carrier} · {p.productType} · #{p.policyNumber}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center justify-start gap-2 sm:max-w-[46%] sm:justify-end">
                              <PolicyTypeBadge policy={p} />
                              {p.isCorporateInsurance && p.businessName ? (
                                <Badge className={cn(BADGE_CLASS, "bg-slate-100 text-slate-600 ring-slate-200")}>
                                  CORPORATE
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                          <div
                            className={cn(
                              "mt-4 grid gap-x-5 gap-y-3",
                              p.category === "Investment" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-3"
                            )}
                          >
                            <div className="space-y-1">
                              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold leading-none">
                                {p.category === "Investment" ? "Initial Amount" : "Face Amount"}
                              </p>
                              <p className="text-xs font-medium text-triton-text tabular-nums leading-tight">
                                {formatCurrency(p.sumAssured)}
                              </p>
                            </div>
                            {p.category === "Investment" ? null : (
                              <div className="space-y-1">
                                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold leading-none">Premium</p>
                                <p className="text-xs font-medium text-triton-text tabular-nums leading-tight">
                                  {formatCurrency(p.premium)}
                                  <span className="text-[10px] text-triton-muted font-normal">
                                    /{PAYMENT_FREQUENCY_LABELS[p.paymentFrequency].toLowerCase()}
                                  </span>
                                </p>
                              </div>
                            )}
                            <div className="space-y-1">
                              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold leading-none">
                                {p.category === "Investment" ? "Effective Date" : "Premium Date"}
                              </p>
                              <p className="text-xs font-medium text-triton-text tabular-nums leading-tight">
                                {p.category === "Investment"
                                  ? p.effectiveDate ? formatDate(p.effectiveDate) : "—"
                                  : p.premiumDate ? formatMonthDay(p.premiumDate) : "—"}
                              </p>
                              {p.premiumDate && p.category !== "Investment" ? (
                                <p className="text-[9px] text-triton-muted leading-none">{formatRelative(p.premiumDate)}</p>
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
