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
import { FollowUpsDueAlert } from "@/components/dashboard/FollowUpsDueAlert";
import { calculateClientTags } from "@/lib/client-tags";
import { formatCurrency, formatCurrencyShort } from "@/lib/format";
import { calculatePortfolioMetrics } from "@/lib/portfolio-metrics";
import { buildPremiumReminderState } from "@/lib/premium-reminders";

export default function DashboardPage() {
  const { clients, policies, followUps, emailReminderSends } = useData();
  const totalClients = clients.length;
  const vipClients = clients.filter((c) =>
    calculateClientTags(c, policies).includes("VIP")
  ).length;

  const metrics = calculatePortfolioMetrics(policies);
  const premiumReminderState = buildPremiumReminderState({ policies, clients, emailReminderSends });
  const pendingPremiumReminders = premiumReminderState.pendingRows.length;
  const completedPremiumReminders = premiumReminderState.completedRows.length;
  const dismissedPremiumReminders = premiumReminderState.dismissedRows.length;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Overview of your book of business"
      />

      <FollowUpsDueAlert clients={clients} followUps={followUps} />

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
          label="Insurance Death Benefit"
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
          value={pendingPremiumReminders}
          subValue={
            metrics.premiumDueCount30d === 0
              ? "No policies due in the next 30 days"
              : pendingPremiumReminders === 0
                ? `${dismissedPremiumReminders > 0 ? "All active reminders cleared" : "All reminders completed"} · ${metrics.premiumDueCount30d} policies due · Total premium ${formatCurrency(
                    premiumReminderState.duePremiumAmount
                  )}`
                : `${pendingPremiumReminders} reminders to send · ${completedPremiumReminders} completed${dismissedPremiumReminders > 0 ? ` · ${dismissedPremiumReminders} dismissed` : ""} · Total premium ${formatCurrency(
                    premiumReminderState.pendingPremiumAmount
                  )}`
          }
          icon={TrendingUp}
          accent="amber"
          className={
            pendingPremiumReminders > 0
              ? "border-amber-200 bg-amber-50/60 shadow-[0_12px_30px_rgba(245,158,11,0.12)]"
              : undefined
          }
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
