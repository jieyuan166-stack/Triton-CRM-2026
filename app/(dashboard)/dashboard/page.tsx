// app/(dashboard)/dashboard/page.tsx
"use client";

import { DollarSign, FileText, TrendingUp, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useData } from "@/components/providers/DataProvider";
import { KPICard } from "@/components/ui-shared/KPICard";
import { UpcomingPremiums } from "@/components/dashboard/UpcomingPremiums";
import { UpcomingBirthdays } from "@/components/dashboard/UpcomingBirthdays";
import { CarrierBreakdown } from "@/components/dashboard/CarrierBreakdown";
import { CategoryBreakdown } from "@/components/dashboard/CategoryBreakdown";
import { calculateClientTags } from "@/lib/client-tags";
import { daysUntil } from "@/lib/date-utils";
import { formatCurrencyCompact } from "@/lib/format";

export default function DashboardPage() {
  const { clients, policies } = useData();

  const totalClients = clients.length;
  const vipClients = clients.filter((c) =>
    calculateClientTags(c, policies).includes("VIP")
  ).length;

  const activePolicies = policies.filter((p) => p.status === "active");
  const totalAUM = activePolicies.reduce((s, p) => s + p.sumAssured, 0);

  const premiumsThisMonth = activePolicies.filter((p) => {
    if (!p.premiumDate) return false;
    const d = daysUntil(p.premiumDate);
    return d >= 0 && d <= 30;
  });
  const premiumsTotal = premiumsThisMonth.reduce((s, p) => s + p.premium, 0);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Overview of your book of business"
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
        <KPICard
          label="Total Clients"
          value={totalClients}
          subValue={`${vipClients} VIP · ${totalClients - vipClients} non-VIP`}
          icon={Users}
          accent="blue"
        />
        <KPICard
          label="Assets Under Management"
          value={formatCurrencyCompact(totalAUM)}
          subValue={`Across ${activePolicies.length} active policies`}
          icon={DollarSign}
          accent="green"
        />
        <KPICard
          label="Active Policies"
          value={activePolicies.length}
          subValue={`${policies.length - activePolicies.length} pending / lapsed`}
          icon={FileText}
          accent="purple"
        />
        <KPICard
          label="Premiums Due (30d)"
          value={formatCurrencyCompact(premiumsTotal)}
          subValue={`${premiumsThisMonth.length} ${
            premiumsThisMonth.length === 1 ? "policy" : "policies"
          }`}
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
        <CarrierBreakdown />
        <CategoryBreakdown />
      </div>
    </>
  );
}
