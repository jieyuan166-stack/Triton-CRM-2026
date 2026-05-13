import type { PaymentFrequency, Policy } from "@/lib/types";
import { dedupePolicies, getPolicyPortfolioAmount } from "@/lib/portfolio-metrics";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const PREMIUM_ANNUAL_FACTOR: Record<PaymentFrequency, number> = {
  Monthly: 12,
  Quarterly: 4,
  "Semi-Annual": 2,
  Annual: 1,
};

export interface YtdBusinessGrowthPoint {
  month: string;
  thisYear: number;
  lastYear: number;
}

export interface YtdBusinessGrowthMetrics {
  currentYtd: number;
  previousYtd: number;
  yoyPercent: number | null;
  isNewGrowth: boolean;
  activePolicyCount: number;
  chartData: YtdBusinessGrowthPoint[];
}

function parseDateOnly(value: string | undefined): Date | null {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function policyContribution(policy: Policy): number {
  if (policy.category === "Insurance") {
    return policy.premium * PREMIUM_ANNUAL_FACTOR[policy.paymentFrequency];
  }

  return getPolicyPortfolioAmount(policy);
}

function truncateToOneDecimal(value: number): number {
  return Math.trunc(value * 10) / 10;
}

export function calculateYtdBusinessGrowth(
  policies: Policy[],
  today: Date = new Date()
): YtdBusinessGrowthMetrics {
  const currentYear = today.getFullYear();
  const previousYear = currentYear - 1;
  const currentMonth = today.getMonth();
  const currentCutoff = new Date(currentYear, currentMonth, today.getDate());
  const previousCutoff = new Date(previousYear, currentMonth, today.getDate());
  const currentMonthly = Array.from({ length: currentMonth + 1 }, () => 0);
  const previousMonthly = Array.from({ length: currentMonth + 1 }, () => 0);

  const activePolicies = dedupePolicies(policies).filter(
    (policy) => policy.status === "active"
  );

  for (const policy of activePolicies) {
    const effectiveDate = parseDateOnly(policy.effectiveDate);
    if (!effectiveDate) continue;

    const contribution = policyContribution(policy);
    if (contribution <= 0) continue;

    const year = effectiveDate.getFullYear();
    const month = effectiveDate.getMonth();

    if (year === currentYear && month <= currentMonth && effectiveDate <= currentCutoff) {
      currentMonthly[month] += contribution;
    }

    if (year === previousYear && month <= currentMonth && effectiveDate <= previousCutoff) {
      previousMonthly[month] += contribution;
    }
  }

  let currentTotal = 0;
  let previousTotal = 0;
  const chartData = currentMonthly.map((value, index) => {
    currentTotal += value;
    previousTotal += previousMonthly[index] ?? 0;

    return {
      month: MONTH_LABELS[index],
      thisYear: currentTotal,
      lastYear: previousTotal,
    };
  });

  const yoyPercent =
    previousTotal > 0
      ? truncateToOneDecimal(((currentTotal - previousTotal) / previousTotal) * 100)
      : null;

  return {
    currentYtd: currentTotal,
    previousYtd: previousTotal,
    yoyPercent,
    isNewGrowth: previousTotal === 0 && currentTotal > 0,
    activePolicyCount: activePolicies.length,
    chartData,
  };
}
