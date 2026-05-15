"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { useData } from "@/components/providers/DataProvider";
import { CarrierLogoBadge } from "@/components/ui-shared/CarrierLogoBadge";
import { EmptyState } from "@/components/ui-shared/EmptyState";
import { UniversalCard } from "@/components/ui-shared/UniversalCard";
import { formatCurrencyShort } from "@/lib/format";
import {
  dedupePolicies,
  getPolicyPortfolioAmount,
} from "@/lib/portfolio-metrics";
import { CARRIERS, type Carrier } from "@/lib/types";

interface CarrierLedgerRow {
  carrier: Carrier;
  totalFaceAmount: number;
  totalAum: number;
  count: number;
}

function buildCarrierRows(policies: ReturnType<typeof useData>["policies"]) {
  const visible = dedupePolicies(policies);

  const rowsByCarrier = new Map<Carrier, CarrierLedgerRow>(
    CARRIERS.map((carrier) => [
      carrier,
      {
        carrier,
        totalFaceAmount: 0,
        totalAum: 0,
        count: 0,
      },
    ])
  );

  for (const policy of visible) {
    const row = rowsByCarrier.get(policy.carrier);
    if (!row) continue;

    row.count += 1;
    if (policy.category === "Investment") {
      row.totalAum += getPolicyPortfolioAmount(policy);
    } else {
      row.totalFaceAmount += getPolicyPortfolioAmount(policy);
    }
  }

  return Array.from(rowsByCarrier.values())
    .filter((row) => row.count > 0)
    .sort(
      (a, b) =>
        b.totalFaceAmount +
        b.totalAum -
        (a.totalFaceAmount + a.totalAum)
    );
}

export function CarrierDistribution({ policies: overridePolicies }: { policies?: ReturnType<typeof useData>["policies"] }) {
  const { policies } = useData();
  const rows = buildCarrierRows(overridePolicies ?? policies);

  return (
    <UniversalCard className="flex min-h-[420px] flex-col">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Carrier Distribution
          </p>
          <h3 className="mt-2 text-lg font-bold tracking-tight text-[#002147]">
            Business by company
          </h3>
        </div>
        <div className="rounded-2xl bg-slate-50 p-2 text-slate-400 ring-1 ring-slate-100">
          <Building2 className="h-4 w-4" />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={Building2}
            title="No carrier distribution yet"
            description="Add active policies to see business grouped by company."
            compact
          />
        </div>
      ) : (
        <div className="mt-5 flex-1 overflow-hidden rounded-2xl border border-slate-100 bg-white">
          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(96px,0.8fr)_minmax(96px,0.8fr)] gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Company
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Insurance
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Investment
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {rows.map((row) => (
              <Link
                key={row.carrier}
                href={`/policies?carrier=${encodeURIComponent(row.carrier)}`}
                aria-label={`View all ${row.carrier} policies`}
                className="grid grid-cols-[minmax(0,1.4fr)_minmax(96px,0.8fr)_minmax(96px,0.8fr)] items-center gap-3 px-4 py-4 transition-colors hover:bg-slate-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/30"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <CarrierLogoBadge carrier={row.carrier} size="md" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#002147]">
                      {row.carrier}
                    </p>
                    <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                      {row.count} active {row.count === 1 ? "item" : "items"}
                    </p>
                  </div>
                </div>

                <LedgerMetric
                  label="Insurance"
                  value={row.totalFaceAmount}
                />
                <LedgerMetric label="Investment" value={row.totalAum} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </UniversalCard>
  );
}

function LedgerMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-1 font-finance text-sm font-bold leading-none text-slate-800 sm:text-base">
        {formatCurrencyShort(value)}
      </p>
    </div>
  );
}
