// components/dashboard/CategoryBreakdown.tsx
"use client";

import { PieChart as PieChartIcon } from "lucide-react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { useData } from "@/components/providers/DataProvider";
import { EmptyState } from "@/components/ui-shared/EmptyState";
import { WidgetCard } from "@/components/ui-shared/WidgetCard";
import { CARRIERS, INSURANCE_PRODUCTS, type ProductType } from "@/lib/types";
import { formatCurrency, formatCurrencyShort } from "@/lib/format";
import { dedupePolicies, getPolicyPortfolioAmount } from "@/lib/portfolio-metrics";
import { cn } from "@/lib/utils";

type RingDatum = {
  name: string;
  value: number;
  color: string;
};

const ASSET_COLORS = ["#7C3AED", "#8B5CF6", "#A78BFA", "#C4B5FD", "#DDD6FE"];
const PROTECTION_COLORS: Record<string, string> = {
  "Term Insurance": "#2563EB",
  "Whole Life": "#60A5FA",
  "Critical Illness": "#93C5FD",
  "Other Protection": "#BFDBFE",
};

function buildAssetsByCompany(
  policies: ReturnType<typeof useData>["policies"]
): RingDatum[] {
  return CARRIERS.map((carrier, index) => {
    const value = policies
      .filter(
        (policy) =>
          policy.status === "active" &&
          policy.category === "Investment" &&
          policy.carrier === carrier
      )
      .reduce((sum, policy) => sum + getPolicyPortfolioAmount(policy), 0);

    return {
      name: carrier,
      value,
      color: ASSET_COLORS[index % ASSET_COLORS.length],
    };
  }).filter((item) => item.value > 0);
}

function protectionBucket(productType: ProductType): string {
  return INSURANCE_PRODUCTS.includes(productType)
    ? productType
    : "Other Protection";
}

function buildProtectionByProduct(
  policies: ReturnType<typeof useData>["policies"]
): RingDatum[] {
  const totals = policies
    .filter((policy) => policy.status === "active" && policy.category === "Insurance")
    .reduce((acc, policy) => {
      const bucket = protectionBucket(policy.productType);
      acc[bucket] = (acc[bucket] ?? 0) + getPolicyPortfolioAmount(policy);
      return acc;
    }, {} as Record<string, number>);

  return ["Term Insurance", "Whole Life", "Critical Illness", "Other Protection"]
    .map((name) => ({
      name,
      value: totals[name] ?? 0,
      color: PROTECTION_COLORS[name],
    }))
    .filter((item) => item.value > 0);
}

function centerValueClass(value: number) {
  const label = formatCurrencyShort(value);
  return cn(
    "font-mono font-semibold text-slate-900 tabular-nums leading-none",
    label.length > 8 ? "text-base" : "text-lg"
  );
}

function MiniRing({
  title,
  subtitle,
  data,
  total,
  emptyTitle,
}: {
  title: string;
  subtitle: string;
  data: RingDatum[];
  total: number;
  emptyTitle: string;
}) {
  if (data.length === 0 || total <= 0) {
    return (
      <div className="flex min-h-[248px] flex-col rounded-2xl border border-slate-100 bg-slate-50/40 p-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {title}
          </p>
          <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <EmptyState icon={PieChartIcon} title={emptyTitle} compact />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {title}
          </p>
          <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
        </div>
        <p className="shrink-0 font-mono text-xs font-semibold tabular-nums text-slate-700">
          {data.length} {data.length === 1 ? "group" : "groups"}
        </p>
      </div>

      <div className="relative mx-auto h-36 w-36">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={44}
              outerRadius={62}
              paddingAngle={3}
              startAngle={90}
              endAngle={-270}
              stroke="#FFFFFF"
              strokeWidth={3}
            >
              {data.map((item) => (
                <Cell key={item.name} fill={item.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                borderRadius: 10,
                border: "1px solid #E2E8F0",
                boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
                fontSize: 12,
                padding: "8px 10px",
              }}
              formatter={(value) => [formatCurrency(value as number), "Amount"]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
            Total
          </span>
          <span className={centerValueClass(total)}>
            {formatCurrencyShort(total)}
          </span>
        </div>
      </div>

      <ul className="mt-4 space-y-2.5">
        {data.map((item) => {
          const pct = total > 0 ? (item.value / total) * 100 : 0;
          return (
            <li key={item.name} className="flex items-center gap-2.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">
                {item.name}
              </span>
              <span className="font-mono text-xs font-semibold tabular-nums text-slate-900">
                {formatCurrencyShort(item.value)}
              </span>
              <span className="w-9 text-right font-mono text-[10px] tabular-nums text-slate-400">
                {Math.trunc(pct)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CategoryBreakdown() {
  const { policies } = useData();
  const activePolicies = dedupePolicies(policies).filter(
    (policy) => policy.status === "active"
  );

  const assets = buildAssetsByCompany(activePolicies);
  const protection = buildProtectionByProduct(activePolicies);
  const assetTotal = assets.reduce((sum, item) => sum + item.value, 0);
  const protectionTotal = protection.reduce((sum, item) => sum + item.value, 0);

  const hasAnyData = assetTotal > 0 || protectionTotal > 0;

  return (
    <WidgetCard
      title="Portfolio Overview"
      description="Assets and protection tracked separately"
    >
      {!hasAnyData ? (
        <EmptyState
          icon={PieChartIcon}
          title="No portfolio data yet"
          description="Add an investment or insurance policy to see the split."
          compact
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <MiniRing
            title="Assets"
            subtitle="Investment AUM by company"
            data={assets}
            total={assetTotal}
            emptyTitle="No assets yet"
          />
          <MiniRing
            title="Protection"
            subtitle="Insurance face amount by product"
            data={protection}
            total={protectionTotal}
            emptyTitle="No protection yet"
          />
        </div>
      )}
    </WidgetCard>
  );
}
