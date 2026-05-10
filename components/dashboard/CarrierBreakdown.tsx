// components/dashboard/CarrierBreakdown.tsx
"use client";

import { Building2 } from "lucide-react";
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
import { WidgetCard } from "@/components/ui-shared/WidgetCard";
import { EmptyState } from "@/components/ui-shared/EmptyState";
import { CARRIER_COLORS } from "@/lib/carrier-colors";
import { CARRIERS, type Carrier } from "@/lib/types";

export function CarrierBreakdown() {
  const { policies } = useData();

  const data = CARRIERS.map((carrier: Carrier) => ({
    carrier,
    short:
      carrier === "Equitable Life"
        ? "Equitable"
        : carrier === "Canada Life"
        ? "CanLife"
        : carrier === "Sun Life"
        ? "SunLife"
        : carrier,
    count: policies.filter(
      (p) => p.carrier === carrier && p.status === "active"
    ).length,
  })).filter((d) => d.count > 0);

  return (
    <WidgetCard
      title="Policies by Carrier"
      description="Active policies"
    >
      {data.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No active policies yet"
          compact
        />
      ) : (
        <div className="h-56 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="short"
                stroke="#94A3B8"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#94A3B8"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: "#F1F5F9" }}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #E2E8F0",
                  fontSize: 12,
                  padding: "6px 10px",
                }}
                labelFormatter={(_label, payload) =>
                  payload?.[0]?.payload?.carrier ?? ""
                }
                formatter={(value) => [value as number, "Policies"]}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {data.map((d) => (
                  <Cell
                    key={d.carrier}
                    fill={CARRIER_COLORS[d.carrier as Carrier]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </WidgetCard>
  );
}
