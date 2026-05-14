// app/(dashboard)/dashboard/page.tsx
"use client";

import { DollarSign, ShieldCheck, TrendingUp, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useData } from "@/components/providers/DataProvider";
import { KPICard } from "@/components/ui-shared/KPICard";
import { UpcomingPremiums } from "@/components/dashboard/UpcomingPremiums";
import { UpcomingBirthdays } from "@/components/dashboard/UpcomingBirthdays";
import { CarrierDistribution } from "@/components/dashboard/CarrierDistribution";
import { CategoryBreakdown } from "@/components/dashboard/CategoryBreakdown";
import { calculateClientTags } from "@/lib/client-tags";
import { formatCurrency, formatCurrencyShort } from "@/lib/format";
import { calculatePortfolioMetrics } from "@/lib/portfolio-metrics";

export default function DashboardPage() {
  const { clients, policies } = useData();

  const totalClients = clients.length;
  const vipClients = clients.filter((c) =>
    calculateClientTags(c, policies).includes("VIP")
  ).length;

  const metrics = calculatePortfolioMetrics(policies);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Overview of your book of business"
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8">
        <KPICard
          label="Total Clients"
          value={totalClients}
          subValue={`${vipClients} VIP · ${totalClients - vipClients} non-VIP`}
          icon={Users}
          accent="blue"
        />
        <KPICard
          label="Insurance Face Amount"
          value={formatCurrencyShort(metrics.insuranceFaceAmount)}
          subValue={`${metrics.activeInsuranceCount} active insurance ${
            metrics.activeInsuranceCount === 1 ? "policy" : "policies"
          }`}
          icon={ShieldCheck}
          accent="green"
        />
        <KPICard
          label="Investment AUM"
          value={formatCurrencyShort(metrics.investmentAum)}
          subValue={`${metrics.activeInvestmentCount} active investment ${
            metrics.activeInvestmentCount === 1 ? "policy" : "policies"
          }`}
          icon={DollarSign}
          accent="purple"
        />
        <KPICard
          label="Premiums Due (30d)"
          value={metrics.premiumDueCount30d}
          subValue={`Total premium ${formatCurrency(
            metrics.premiumDueAmount30d
          )}`}
          icon={TrendingUp}
          accent="amber"
        />
      </div>

      {/* Reminder workflows */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
        <UpcomingPremiums />
        <UpcomingBirthdays />
      </div>

      {/* Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <CarrierDistribution />
        <CategoryBreakdown />
      </div>
    </>
  );
}
