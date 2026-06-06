// components/dashboard/CategoryBreakdown.tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  PieChart as PieChartIcon,
  Shield,
} from "lucide-react";
import {
  Cell,
  Pie,
  PieChart,
  Tooltip,
} from "recharts";
import { useData } from "@/components/providers/DataProvider";
import { CarrierLogoBadge } from "@/components/ui-shared/CarrierLogoBadge";
import { EmptyState } from "@/components/ui-shared/EmptyState";
import { WidgetCard } from "@/components/ui-shared/WidgetCard";
import { CARRIER_COLORS } from "@/lib/carrier-colors";
import {
  CARRIERS,
  INSURANCE_PRODUCTS,
  type Carrier,
  type PaymentFrequency,
  type Policy,
  type ProductType,
} from "@/lib/types";
import { formatCurrency, formatCurrencyShort } from "@/lib/format";
import {
  calculatePortfolioMetrics,
  dedupePolicies,
  getPolicyPortfolioAmount,
} from "@/lib/portfolio-metrics";
import { cn } from "@/lib/utils";

type RingDatum = {
  name: string;
  value: number;
  color: string;
};

type ViewMode = "distribution" | "new_money";

type NewMoneyRow = {
  company: Carrier;
  ytdNew: number;
  lastYearYtd: number;
  lastYearTotal: number;
};

const PREMIUM_ANNUAL_FACTOR: Record<PaymentFrequency, number> = {
  Monthly: 12,
  Quarterly: 4,
  "Semi-Annual": 2,
  Annual: 1,
};

const PROTECTION_COLORS: Record<string, string> = {
  "Term Insurance": "#2563EB",
  "Whole Life": "#7C3AED",
  "Critical Illness": "#DC2626",
  "Other Protection": "#64748B",
};

function parseDateOnly(value: string | undefined): Date | null {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function annualizedPremium(policy: Policy) {
  return policy.premium * PREMIUM_ANNUAL_FACTOR[policy.paymentFrequency];
}

function buildNewMoneyRows(
  policies: Policy[],
  category: Policy["category"],
  today = new Date()
): NewMoneyRow[] {
  const currentYear = today.getFullYear();
  const previousYear = currentYear - 1;
  const currentCutoff = new Date(
    currentYear,
    today.getMonth(),
    today.getDate()
  );
  const previousCutoff = new Date(
    previousYear,
    today.getMonth(),
    today.getDate()
  );

  const rows = new Map<Carrier, NewMoneyRow>(
    CARRIERS.map((carrier) => [
      carrier,
      { company: carrier, ytdNew: 0, lastYearYtd: 0, lastYearTotal: 0 },
    ])
  );

  for (const policy of policies) {
    if (policy.status !== "active" || policy.category !== category) continue;

    const effectiveDate = parseDateOnly(policy.effectiveDate);
    if (!effectiveDate) continue;

    const contribution =
      category === "Insurance"
        ? annualizedPremium(policy)
        : policy.sumAssured || policy.loanAmount || 0;
    if (contribution <= 0) continue;

    const row = rows.get(policy.carrier);
    if (!row) continue;

    const year = effectiveDate.getFullYear();
    if (year === currentYear && effectiveDate <= currentCutoff) {
      row.ytdNew += contribution;
    }

    if (year === previousYear) {
      row.lastYearTotal += contribution;
      if (effectiveDate <= previousCutoff) {
        row.lastYearYtd += contribution;
      }
    }
  }

  return Array.from(rows.values())
    .filter((row) => row.ytdNew > 0 || row.lastYearYtd > 0 || row.lastYearTotal > 0)
    .sort((a, b) => b.ytdNew - a.ytdNew);
}

function buildAssetsByCompany(
  policies: ReturnType<typeof useData>["policies"]
): RingDatum[] {
  return CARRIERS.map((carrier) => {
    const value = policies
      .filter(
        (policy) =>
          policy.category === "Investment" &&
          policy.carrier === carrier
      )
      .reduce((sum, policy) => sum + getPolicyPortfolioAmount(policy), 0);

    return {
      name: carrier,
      value,
      color: CARRIER_COLORS[carrier],
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
    .filter((policy) => policy.category === "Insurance")
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
    "font-finance font-semibold text-slate-900 leading-none",
    label.length > 8 ? "text-base" : "text-lg"
  );
}

function displayPercentages(data: RingDatum[], total: number) {
  let accumulated = 0;
  return data.map((item, index) => {
    const isLast = index === data.length - 1;
    const raw = total > 0 ? (item.value / total) * 100 : 0;
    const pct = isLast ? Math.max(0, 100 - accumulated) : Math.floor(raw * 10) / 10;
    if (!isLast) accumulated += pct;
    return pct.toFixed(1);
  });
}

function GrowthBadge({ current, previous }: { current: number; previous: number }) {
  if (previous <= 0) {
    return current > 0 ? (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
        New
      </span>
    ) : (
      <span className="text-xs text-slate-400">—</span>
    );
  }

  const change = Math.trunc(((current - previous) / previous) * 1000) / 10;
  const isPositive = change >= 0;
  const Icon = isPositive ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        "inline-flex items-center justify-end text-xs font-semibold",
        isPositive ? "text-emerald-600" : "text-rose-600"
      )}
    >
      <Icon className="mr-0.5 h-3.5 w-3.5" />
      {Math.abs(change).toFixed(1)}%
    </span>
  );
}

function carrierPolicyHref(carrier: Carrier) {
  return `/policies?carrier=${encodeURIComponent(carrier)}&view=table`;
}

function newMoneyPolicyHref({
  carrier,
  category,
  year,
}: {
  carrier: Carrier;
  category: Policy["category"];
  year: number;
}) {
  return `/policies?carrier=${encodeURIComponent(carrier)}&view=table&category=${category}&newMoneyYear=${year}`;
}

function NewMoneySection({
  title,
  subtitle,
  totalLabel,
  rows,
  icon: Icon,
  accentClass,
  category,
  year,
  previousYear,
}: {
  title: string;
  subtitle: string;
  totalLabel: string;
  rows: NewMoneyRow[];
  icon: typeof Activity;
  accentClass: string;
  category: Policy["category"];
  year: number;
  previousYear: number;
}) {
  const total = rows.reduce((sum, row) => sum + row.ytdNew, 0);

  return (
    <section className="rounded-2xl border border-[#E8DCC4]/75 bg-card p-4">
      <div className="mb-3 flex flex-col gap-3 rounded-xl bg-[#F4EAD8]/55 p-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <Icon className={cn("h-3.5 w-3.5", accentClass)} />
            {title}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{subtitle}</p>
        </div>
        <div className="shrink-0 sm:text-right">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {year} {totalLabel}
          </span>
          <span className={cn("font-finance text-base font-bold", accentClass)}>
            {formatCurrencyShort(total)}
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Icon}
          title="No new business yet"
          description="New money will appear here once policies have an effective date this year."
          compact
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left">
            <thead>
              <tr className="border-b border-[#E8DCC4]/75 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <th className="pb-2 pr-4 font-semibold">Company</th>
                <th className="pb-2 px-4 text-right font-semibold">
                  {year} YTD
                </th>
                <th className="pb-2 px-4 text-right font-semibold">
                  {previousYear} YTD
                </th>
                <th className="pb-2 px-4 text-right font-semibold">YoY</th>
                <th className="pb-2 pl-4 text-right font-semibold">
                  {previousYear} Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8DCC4]/60">
              {rows.map((row) => (
                <tr key={row.company} className="transition-colors hover:bg-[#F8F0E2]/60">
                  <td className="py-2.5 pr-4 text-xs font-semibold text-navy">
                    <Link
                      href={carrierPolicyHref(row.company)}
                      className="inline-flex min-w-0 items-center gap-2 rounded-md text-navy transition-colors hover:text-[#8A641E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-amber/30"
                      aria-label={`View ${row.company} policies`}
                    >
                      <CarrierLogoBadge carrier={row.company} size="sm" />
                      <span className="min-w-0">{row.company}</span>
                    </Link>
                  </td>
                  <td className={cn("py-2.5 px-4 text-right font-finance text-xs font-bold", accentClass)}>
                    <Link
                      href={newMoneyPolicyHref({
                        carrier: row.company,
                        category,
                        year,
                      })}
                      className="rounded-md transition-colors hover:text-[#8A641E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-amber/30"
                      aria-label={`View ${row.company} ${year} new money policies`}
                    >
                      {formatCurrencyShort(row.ytdNew)}
                    </Link>
                  </td>
                  <td className="py-2.5 px-4 text-right font-finance text-xs font-semibold text-slate-600">
                    <Link
                      href={newMoneyPolicyHref({
                        carrier: row.company,
                        category,
                        year: previousYear,
                      })}
                      className="rounded-md transition-colors hover:text-[#8A641E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-amber/30"
                      aria-label={`View ${row.company} ${previousYear} YTD new money policies`}
                    >
                      {formatCurrencyShort(row.lastYearYtd)}
                    </Link>
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <GrowthBadge current={row.ytdNew} previous={row.lastYearYtd} />
                  </td>
                  <td className="py-2.5 pl-4 text-right font-finance text-xs font-medium text-slate-500">
                    {formatCurrencyShort(row.lastYearTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
        <p className="shrink-0 font-number text-xs font-semibold text-slate-700">
          {data.length} {data.length === 1 ? "group" : "groups"}
        </p>
      </div>

      <div className="relative mx-auto h-36 min-h-36 w-36 min-w-36">
        <PieChart width={144} height={144}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx={72}
            cy={72}
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
        {(() => {
          const percentages = displayPercentages(data, total);
          return data.map((item, index) => (
            <li key={item.name || "unknown"} className="grid grid-cols-[0.625rem_minmax(0,1fr)_auto_2.25rem] items-center gap-2.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span
                className="min-w-0 text-xs font-medium leading-snug text-slate-700"
                title={item.name || "Unspecified"}
              >
                {item.name || "Unspecified"}
              </span>
              <span className="font-finance text-xs font-semibold text-slate-900">
                {formatCurrencyShort(item.value)}
              </span>
              <span className="w-9 text-right font-number text-[10px] text-slate-400">
                {percentages[index]}%
              </span>
            </li>
          ));
        })()}
      </ul>
    </div>
  );
}

export function CategoryBreakdown({ policies: overridePolicies }: { policies?: ReturnType<typeof useData>["policies"] }) {
  const [viewMode, setViewMode] = useState<ViewMode>("new_money");
  const { policies } = useData();
  const sourcePolicies = overridePolicies ?? policies;
  const filteredActivePolicies = dedupePolicies(sourcePolicies).filter(
    (policy) => policy.status === "active"
  );
  const metrics = calculatePortfolioMetrics(sourcePolicies);

  const assets = buildAssetsByCompany(filteredActivePolicies);
  const protection = buildProtectionByProduct(filteredActivePolicies);
  const assetTotal = metrics.investmentAum;
  const protectionTotal = metrics.insuranceFaceAmount;
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;
  const newMoneyPolicies = useMemo(() => dedupePolicies(sourcePolicies), [sourcePolicies]);
  const investmentNewMoney = useMemo(
    () => buildNewMoneyRows(newMoneyPolicies, "Investment"),
    [newMoneyPolicies]
  );
  const insuranceNewPremium = useMemo(
    () => buildNewMoneyRows(newMoneyPolicies, "Insurance"),
    [newMoneyPolicies]
  );
  const hasNewMoneyData = investmentNewMoney.length > 0 || insuranceNewPremium.length > 0;

  const hasAnyData = assetTotal > 0 || protectionTotal > 0;

  return (
    <WidgetCard
      title="Portfolio Overview"
      description="Assets and protection tracked separately"
      action={
        <div className="flex rounded-xl bg-[#F4EAD8]/80 p-0.5 text-xs font-semibold ring-1 ring-[#E8DCC4]/80">
          <button
            type="button"
            onClick={() => setViewMode("distribution")}
            className={cn(
              "rounded-lg px-3 py-1.5 transition",
              viewMode === "distribution"
                ? "bg-white text-navy shadow-sm"
                : "text-slate-500 hover:text-navy"
            )}
          >
            Distribution
          </button>
          <button
            type="button"
            onClick={() => setViewMode("new_money")}
            className={cn(
              "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 transition",
              viewMode === "new_money"
                ? "bg-white text-emerald-700 shadow-sm"
                : "text-slate-500 hover:text-navy"
            )}
          >
            <Activity className="h-3.5 w-3.5" />
            New Money
          </button>
        </div>
      }
    >
      {viewMode === "new_money" ? (
        !hasNewMoneyData ? (
          <EmptyState
            icon={Activity}
            title="No new money yet"
            description="Current-year new business will appear here based on policy effective dates."
            compact
          />
        ) : (
          <div className="space-y-4">
            <NewMoneySection
              title="Investment: Net New Assets"
              subtitle="Initial investment / AUM added this year by company"
              totalLabel="Total New Money"
              rows={investmentNewMoney}
              icon={Activity}
              accentClass="text-emerald-600"
              category="Investment"
              year={currentYear}
              previousYear={previousYear}
            />
            <NewMoneySection
              title="Insurance: First Year Premium"
              subtitle="Annualized new premium from policies effective this year"
              totalLabel="Total FYP"
              rows={insuranceNewPremium}
              icon={Shield}
              accentClass="text-blue-600"
              category="Insurance"
              year={currentYear}
              previousYear={previousYear}
            />
          </div>
        )
      ) : !hasAnyData ? (
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
            subtitle="Insurance total coverage by product"
            data={protection}
            total={protectionTotal}
            emptyTitle="No protection yet"
          />
        </div>
      )}
    </WidgetCard>
  );
}
