import { buildPremiumReminderState } from "@/lib/premium-reminders";
import type { Policy } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PortfolioMetrics {
  insuranceFaceAmount: number;
  investmentAum: number;
  activeInsuranceCount: number;
  activeInvestmentCount: number;
  premiumDueCount30d: number;
  premiumDueAmount30d: number;
}

function startOfCalendarDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function calendarDayNumber(value: Date): number {
  return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / DAY_MS;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function monthlyOccurrence(start: Date, monthOffset: number): Date {
  const year = start.getFullYear();
  const month = start.getMonth() + monthOffset;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  return new Date(
    targetYear,
    targetMonth,
    Math.min(start.getDate(), daysInMonth(targetYear, targetMonth))
  );
}

function semiMonthlyOccurrence(start: Date, occurrenceIndex: number): Date {
  const monthOffset = Math.floor(occurrenceIndex / 2);
  const first = monthlyOccurrence(start, monthOffset);
  if (occurrenceIndex % 2 === 0) return first;

  const second = new Date(first);
  second.setDate(second.getDate() + 15);
  return second;
}

export function getOngoingInvestmentContributionCount(
  policy: Policy,
  today = new Date()
): number {
  const amount = policy.ongoingInvestmentAmount ?? 0;
  if (
    policy.category !== "Investment" ||
    amount <= 0 ||
    !policy.ongoingInvestmentFrequency
  ) {
    return 0;
  }

  // Preserve legacy records that have an amount/frequency but predate the
  // start-date field by treating the stored amount as one contribution.
  if (!policy.ongoingInvestmentStartDate) return 1;

  const start = startOfCalendarDay(new Date(`${policy.ongoingInvestmentStartDate}T00:00:00`));
  const todayEnd = startOfCalendarDay(today);
  const configuredEnd = policy.ongoingInvestmentEndDate
    ? startOfCalendarDay(new Date(`${policy.ongoingInvestmentEndDate}T00:00:00`))
    : todayEnd;
  const cutoff = configuredEnd < todayEnd ? configuredEnd : todayEnd;
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(cutoff.getTime()) ||
    cutoff < start
  ) {
    return 0;
  }

  if (policy.ongoingInvestmentFrequency === "Weekly") {
    return Math.floor((calendarDayNumber(cutoff) - calendarDayNumber(start)) / 7) + 1;
  }
  if (policy.ongoingInvestmentFrequency === "Bi-weekly") {
    return Math.floor((calendarDayNumber(cutoff) - calendarDayNumber(start)) / 14) + 1;
  }
  if (policy.ongoingInvestmentFrequency === "Custom") {
    // A free-text schedule cannot be accrued safely without a machine-readable
    // interval. Count the starting contribution once instead of guessing.
    return 1;
  }

  const occurrenceAt =
    policy.ongoingInvestmentFrequency === "Semi-monthly"
      ? semiMonthlyOccurrence
      : monthlyOccurrence;
  let count = 0;
  // 2,400 iterations covers 100 years of semi-monthly contributions.
  while (count < 2_400 && occurrenceAt(start, count) <= cutoff) {
    count += 1;
  }
  return count;
}

export function getAccruedOngoingInvestmentAmount(
  policy: Policy,
  today = new Date()
): number {
  return (
    (policy.ongoingInvestmentAmount ?? 0) *
    getOngoingInvestmentContributionCount(policy, today)
  );
}

export function getOngoingInvestmentAmountBetween(
  policy: Policy,
  rangeStart: Date,
  rangeEnd: Date
): number {
  if (rangeEnd < rangeStart) return 0;
  const beforeStart = new Date(
    rangeStart.getFullYear(),
    rangeStart.getMonth(),
    rangeStart.getDate() - 1
  );
  return Math.max(
    0,
    getAccruedOngoingInvestmentAmount(policy, rangeEnd) -
      getAccruedOngoingInvestmentAmount(policy, beforeStart)
  );
}

export function getPolicyPortfolioAmount(policy: Policy, today = new Date()): number {
  if (policy.category === "Investment") {
    return (
      (policy.sumAssured || policy.loanAmount || 0) +
      getAccruedOngoingInvestmentAmount(policy, today)
    );
  }
  return policy.sumAssured || 0;
}

export function policyDedupeKey(policy: Policy): string {
  return (policy.policyNumber || policy.id).trim().toLowerCase();
}

export function dedupePolicies<T extends Policy>(policies: T[]): T[] {
  const seen = new Set<string>();
  return policies.filter((policy) => {
    const key = policyDedupeKey(policy);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function calculatePortfolioMetrics(
  policies: Policy[],
  options: { status?: Policy["status"] | "all" } = {}
): PortfolioMetrics {
  const status = options.status ?? "active";
  const active = dedupePolicies(policies).filter(
    (policy) => status === "all" || policy.status === status
  );
  const activeInsurance = active.filter((policy) => policy.category === "Insurance");
  const activeInvestment = active.filter((policy) => policy.category === "Investment");

  const premiumReminderState = buildPremiumReminderState({ policies: active });

  return {
    insuranceFaceAmount: activeInsurance.reduce(
      (sum, policy) => sum + getPolicyPortfolioAmount(policy),
      0
    ),
    investmentAum: activeInvestment.reduce(
      (sum, policy) => sum + getPolicyPortfolioAmount(policy),
      0
    ),
    activeInsuranceCount: activeInsurance.length,
    activeInvestmentCount: activeInvestment.length,
    premiumDueCount30d: premiumReminderState.duePolicies.length,
    premiumDueAmount30d: premiumReminderState.duePremiumAmount,
  };
}
