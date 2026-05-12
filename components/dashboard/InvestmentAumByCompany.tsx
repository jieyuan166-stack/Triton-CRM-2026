// components/dashboard/InvestmentAumByCompany.tsx
"use client";

import { BriefcaseBusiness } from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useData } from "@/components/providers/DataProvider";
import { EmptyState } from "@/components/ui-shared/EmptyState";
import { WidgetCard } from "@/components/ui-shared/WidgetCard";
import { CARRIER_COLORS } from "@/lib/carrier-colors";
import { formatCurrency, formatCurrencyCompact } from "@/lib/format";
import { CARRIERS, type Carrier } from "@/lib/types";

function carrierShortLabel(carrier: Carrier) {
  if (carrier === "Equitable Life") return "Equitable";
  if (carrier === "Canada Life") return "CanLife";
  if (carrier === "Sun Life") return "SunLife";
  return carrier;
}

export function InvestmentAumByCompany() {
  const { policies } = useData();

  const data = CARRIERS.map((carrier) => {
    const carrierPolicies = policies.filter(
      (policy) =>
        policy.status === "active" &&
        policy.category === "Investment" &&
        policy.carrier === carrier,
    );
    const aum = carrierPolicies.reduce((sum, policy) => {
      const amount =
        policy.sumAssured && policy.sumAssured > 0
          ? policy.sumAssured
          : policy.loanAmount ?? 0;
      return sum + amount;
    }, 0);
    return {
      carrier,
      short: carrierShortLabel(carrier),
      aum,
      count: carrierPolicies.length,
    };
  })
    .filter((item) => item.aum > 0)
    .sort((a, b) => b.aum - a.aum);

  const total = data.reduce((sum, item) => sum + item.aum, 0);

  return (
    <WidgetCard
      title="Investment AUM by Company"
      description="Active investment policies"
      icon={
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
          <BriefcaseBusiness className="h-4 w-4" />
        </span>
      }
    >
      {data.length === 0 ? (
        <EmptyState
          icon={BriefcaseBusiness}
          title="No investment AUM yet"
          description="Add an investment policy with an initial investment to see this breakdown."
          compact
        />
      ) : (
        <div className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Total Investment AUM
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                {formatCurrencyCompact(total)}
              </p>
            </div>
            <p className="text-xs text-slate-500">
              {data.reduce((sum, item) => sum + item.count, 0)} active{" "}
              {data.reduce((sum, item) => sum + item.count, 0) === 1
                ? "policy"
                : "policies"}
            </p>
          </div>

          <div className="h-48 -ml-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 4, right: 20, bottom: 0, left: 10 }}
              >
                <XAxis
                  type="number"
                  hide
                  domain={[0, "dataMax"]}
                />
                <YAxis
                  type="category"
                  dataKey="short"
                  width={70}
                  stroke="#64748B"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ fill: "#F8FAFC" }}
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid #E2E8F0",
                    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
                    fontSize: 12,
                    padding: "8px 10px",
                  }}
                  labelFormatter={(_label, payload) =>
                    payload?.[0]?.payload?.carrier ?? ""
                  }
                  formatter={(value, _name, item) => [
                    formatCurrency(value as number),
                    `${item.payload.count} ${
                      item.payload.count === 1 ? "policy" : "policies"
                    }`,
                  ]}
                />
                <Bar dataKey="aum" radius={[0, 8, 8, 0]} barSize={18}>
                  {data.map((item) => (
                    <Cell
                      key={item.carrier}
                      fill={CARRIER_COLORS[item.carrier]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <ul className="space-y-2.5">
            {data.map((item) => {
              const pct = total > 0 ? (item.aum / total) * 100 : 0;
              return (
                <li key={item.carrier} className="flex items-center gap-3">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: CARRIER_COLORS[item.carrier] }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">
                    {item.carrier}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-slate-900">
                    {formatCurrencyCompact(item.aum)}
                  </span>
                  <span className="w-12 text-right text-xs tabular-nums text-slate-400">
                    {pct.toFixed(0)}%
                  </span>
                </li>
              );
            })}
            <li className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-3">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-900" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
                Total Investment AUM
              </span>
              <span className="text-sm font-bold tabular-nums text-slate-900">
                {formatCurrency(total)}
              </span>
              <span className="w-12 text-right text-xs font-medium tabular-nums text-slate-500">
                100%
              </span>
            </li>
          </ul>
        </div>
      )}
    </WidgetCard>
  );
}
