import { daysUntil } from "@/lib/date-utils";
import type { Policy } from "@/lib/types";

export interface PortfolioMetrics {
  insuranceFaceAmount: number;
  investmentAum: number;
  activeInsuranceCount: number;
  activeInvestmentCount: number;
  premiumDueCount30d: number;
  premiumDueAmount30d: number;
}

export function getPolicyPortfolioAmount(policy: Policy): number {
  if (policy.category === "Investment") {
    return policy.sumAssured || policy.loanAmount || 0;
  }
  return policy.sumAssured || 0;
}

export function calculatePortfolioMetrics(policies: Policy[]): PortfolioMetrics {
  const active = policies.filter((policy) => policy.status === "active");
  const activeInsurance = active.filter((policy) => policy.category === "Insurance");
  const activeInvestment = active.filter((policy) => policy.category === "Investment");

  const premiumsDue = activeInsurance.filter((policy) => {
    if (!policy.premiumDate) return false;
    const dueInDays = daysUntil(policy.premiumDate);
    return dueInDays >= 0 && dueInDays <= 30;
  });

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
    premiumDueCount30d: premiumsDue.length,
    premiumDueAmount30d: premiumsDue.reduce(
      (sum, policy) => sum + (policy.premium || 0),
      0
    ),
  };
}
