"use client";

import Link from "next/link";
import { useMemo } from "react";
import { FileText, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { WidgetCard } from "@/components/ui-shared/WidgetCard";
import { EmptyState } from "@/components/ui-shared/EmptyState";
import { PolicyDataCard } from "@/components/ui-shared/PolicyDataCard";
import type { Policy } from "@/lib/types";
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
                      <PolicyDataCard
                        policy={p}
                        href={`/policies/${p.id}`}
                        currentViewClientId={clientId}
                        className={style.row}
                      />
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
