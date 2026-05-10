// components/clients/ClientPoliciesCard.tsx
"use client";

import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { WidgetCard } from "@/components/ui-shared/WidgetCard";
import { EmptyState } from "@/components/ui-shared/EmptyState";
import { CARRIER_COLORS } from "@/lib/carrier-colors";
import { formatMonthDay, formatRelative } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/format";
import { PAYMENT_FREQUENCY_LABELS, type Policy } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  active: "bg-accent-green/15 text-emerald-700 border-0",
  pending: "bg-accent-amber/15 text-amber-700 border-0",
  lapsed: "bg-accent-red/15 text-red-700 border-0",
};

interface ClientPoliciesCardProps {
  clientId: string;
  policies: Policy[];
}

export function ClientPoliciesCard({
  clientId,
  policies,
}: ClientPoliciesCardProps) {
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
        <ul className="divide-y divide-slate-100">
          {policies.map((p) => (
            <li key={p.id}>
              <Link
                href={`/policies/${p.id}`}
                className="flex items-stretch gap-3 px-5 md:px-6 py-3.5 hover:bg-slate-50 transition-colors"
              >
                <span
                  className="w-1 self-stretch rounded-full shrink-0"
                  style={{ backgroundColor: CARRIER_COLORS[p.carrier] }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <p className="text-sm font-semibold text-triton-text truncate">
                      {p.productName}
                    </p>
                    <Badge className={STATUS_STYLE[p.status]}>{p.status}</Badge>
                  </div>
                  <p className="text-xs text-triton-muted mb-2 truncate">
                    {p.carrier} · {p.productType} · {p.policyNumber}
                  </p>
                  {p.isCorporateInsurance && p.businessName ? (
                    <p className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 ring-1 ring-slate-200/60 mb-2">
                      Corporate · {p.businessName}
                    </p>
                  ) : null}
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                        Face Amount
                      </p>
                      <p className="font-semibold text-triton-text tabular-nums">
                        {formatCurrency(p.sumAssured)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                        Premium
                      </p>
                      <p className="font-semibold text-triton-text tabular-nums">
                        {formatCurrency(p.premium)}
                        <span className="text-triton-muted font-normal">
                          {" "}
                          /{PAYMENT_FREQUENCY_LABELS[p.paymentFrequency]
                            .toLowerCase()
                            .slice(0, 3)}
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                        Premium Date
                      </p>
                      <p className="font-semibold text-triton-text tabular-nums">
                        {p.premiumDate ? formatMonthDay(p.premiumDate) : "—"}
                      </p>
                      {p.premiumDate ? (
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
      )}
    </WidgetCard>
  );
}
