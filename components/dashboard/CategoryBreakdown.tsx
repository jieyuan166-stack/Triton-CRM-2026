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
import { WidgetCard } from "@/components/ui-shared/WidgetCard";
import { EmptyState } from "@/components/ui-shared/EmptyState";
import { formatCurrency } from "@/lib/format";
import { getPolicyPortfolioAmount } from "@/lib/portfolio-metrics";

const CATEGORY_COLORS = {
  Insurance: "#3B82F6",
  Investment: "#8B5CF6",
} as const;

export function CategoryBreakdown() {
  const { policies } = useData();

  const totals = policies
    .filter((p) => p.status === "active")
    .reduce(
      (acc, p) => {
        acc[p.category] = (acc[p.category] ?? 0) + getPolicyPortfolioAmount(p);
        return acc;
      },
      { Insurance: 0, Investment: 0 } as Record<"Insurance" | "Investment", number>
    );

  const data = (
    Object.entries(totals) as [keyof typeof CATEGORY_COLORS, number][]
  )
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  const grandTotal = data.reduce((s, d) => s + d.value, 0);

  return (
    <WidgetCard
      title="Portfolio by Category"
      description="Insurance face amount and investment AUM"
    >
      {data.length === 0 ? (
        <EmptyState
          icon={PieChartIcon}
          title="No data yet"
          compact
        />
      ) : (
        <div className="flex items-center gap-6">
          <div className="h-44 w-44 shrink-0 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={2}
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                >
                  {data.map((d) => (
                    <Cell key={d.name} fill={CATEGORY_COLORS[d.name]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #E2E8F0",
                    fontSize: 12,
                    padding: "6px 10px",
                  }}
                  formatter={(value) => [
                    formatCurrency(value as number),
                    "Amount",
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] uppercase tracking-wider text-triton-muted font-medium">
                Total
              </span>
              <span className="text-base font-bold text-triton-text tabular-nums">
                {formatCurrency(grandTotal)}
              </span>
            </div>
          </div>

          <ul className="flex-1 space-y-3 min-w-0">
            {data.map((d) => {
              const pct = (d.value / grandTotal) * 100;
              return (
                <li key={d.name} className="flex items-center gap-3">
                  <span
                    className="h-3 w-3 rounded-sm shrink-0"
                    style={{ backgroundColor: CATEGORY_COLORS[d.name] }}
                  />
                  <span className="text-sm font-medium text-triton-text flex-1">
                    {d.name}
                  </span>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-triton-text tabular-nums">
                      {formatCurrency(d.value)}
                    </p>
                    <p className="text-xs text-triton-muted tabular-nums">
                      {pct.toFixed(1)}%
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </WidgetCard>
  );
}
