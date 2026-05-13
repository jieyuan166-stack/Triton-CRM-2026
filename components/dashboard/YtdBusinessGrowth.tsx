"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useData } from "@/components/providers/DataProvider";
import { EmptyState } from "@/components/ui-shared/EmptyState";
import { UniversalCard } from "@/components/ui-shared/UniversalCard";
import { formatCurrency, formatCurrencyShort } from "@/lib/format";
import { calculateYtdBusinessGrowth } from "@/lib/ytd-business-growth";
import { cn } from "@/lib/utils";

function formatYoy(value: number | null, isNewGrowth: boolean) {
  if (isNewGrowth) return "New YoY";
  if (value == null) return "0.0% YoY";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}% YoY`;
}

export function YtdBusinessGrowth() {
  const { policies } = useData();
  const metrics = calculateYtdBusinessGrowth(policies);
  const isPositive = metrics.isNewGrowth || (metrics.yoyPercent ?? 0) >= 0;
  const hasData = metrics.currentYtd > 0 || metrics.previousYtd > 0;

  return (
    <UniversalCard className="flex min-h-[420px] flex-col">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            YTD Business Growth
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="font-mono text-3xl font-bold leading-none tracking-tight text-[#002147]">
              {formatCurrencyShort(metrics.currentYtd)}
            </p>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
                isPositive
                  ? "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100"
                  : "bg-red-50 text-red-600 ring-1 ring-red-100"
              )}
            >
              {isPositive ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" />
              )}
              {formatYoy(metrics.yoyPercent, metrics.isNewGrowth)}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Insurance annualized premium + investment initial contribution
          </p>
        </div>

        <div className="hidden shrink-0 rounded-2xl bg-slate-50 px-3 py-2 text-right sm:block">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Last YTD
          </p>
          <p className="mt-1 font-mono text-sm font-semibold text-slate-700">
            {formatCurrencyShort(metrics.previousYtd)}
          </p>
        </div>
      </div>

      {!hasData ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={TrendingUp}
            title="No YTD business yet"
            description="Add active policies with effective dates to track year-to-date growth."
            compact
          />
        </div>
      ) : (
        <>
          <div className="mt-6 h-56 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={metrics.chartData}
                margin={{ top: 8, right: 8, bottom: 4, left: -18 }}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="#E2E8F0"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "#94A3B8" }}
                />
                <YAxis
                  width={54}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "#94A3B8" }}
                  tickFormatter={(value) => formatCurrencyShort(Number(value))}
                />
                <Tooltip
                  cursor={{ stroke: "#CBD5E1", strokeDasharray: "4 4" }}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #E2E8F0",
                    boxShadow: "0 14px 40px rgba(15, 23, 42, 0.10)",
                    fontSize: 12,
                    padding: "10px 12px",
                  }}
                  formatter={(value, name) => [
                    formatCurrency(Number(value)),
                    name === "thisYear" ? "This Year" : "Last Year",
                  ]}
                  labelFormatter={(label) => `${label} YTD`}
                />
                <Line
                  type="monotone"
                  dataKey="lastYear"
                  stroke="#CBD5E1"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  activeDot={{ r: 4, fill: "#CBD5E1", stroke: "#FFFFFF", strokeWidth: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="thisYear"
                  stroke="#002147"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 5, fill: "#002147", stroke: "#FFFFFF", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                This Year
              </p>
              <p className="mt-1 font-mono text-sm font-semibold text-[#002147]">
                {formatCurrencyShort(metrics.currentYtd)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Last Year
              </p>
              <p className="mt-1 font-mono text-sm font-semibold text-slate-600">
                {formatCurrencyShort(metrics.previousYtd)}
              </p>
            </div>
          </div>
        </>
      )}
    </UniversalCard>
  );
}
