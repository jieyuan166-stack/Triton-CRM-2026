// lib/client-tags.ts
// Single source of truth for the dynamic Client tag system.
//
// All tags are derived from client + policy state — never persisted on the
// Client record. Computing on-read avoids drift when policies change.

import { TAG_VALUES, type TagValue } from "./constants";
import type { Client, PaymentFrequency, Policy } from "./types";

export type DynamicTag = TagValue;
export const DYNAMIC_TAGS = TAG_VALUES;

/** Annual insurance premium (CAD) above which "VIP" is auto-applied. */
export const VIP_PREMIUM_THRESHOLD = 100_000;

const FREQUENCY_PER_YEAR: Record<PaymentFrequency, number> = {
  Monthly: 12,
  Quarterly: 4,
  "Semi-Annual": 2,
  Annual: 1,
};

function annualPremium(p: Policy): number {
  return p.premium * FREQUENCY_PER_YEAR[p.paymentFrequency];
}

/**
 * Compute the dynamic tags for a client. Lapsed policies don't drive tags
 * (they shouldn't keep the client labelled as Insurance / Loan / etc.).
 *
 * Rules:
 * - "insurance"  : any non-lapsed policy with category "Insurance"
 * - "investment" : any non-lapsed policy with category "Investment"
 * - "VIP"        : annual insurance premium total > $100k OR holds both
 *                  insurance AND investment policies
 * - "Loan"       : any non-lapsed policy with isInvestmentLoan === true
 * - "Corporate"  : any non-lapsed policy with isCorporateInsurance === true
 *                  AND a non-empty businessName
 *
 * Returned in a stable display order so tag rows look consistent.
 */
export function calculateClientTags(
  client: Client,
  policies: Policy[]
): DynamicTag[] {
  const live = policies.filter(
    (p) => p.clientId === client.id && p.status !== "lapsed"
  );

  const hasInsurance = live.some((p) => p.category === "Insurance");
  const hasInvestment = live.some((p) => p.category === "Investment");

  const insurancePremiumYear = live
    .filter((p) => p.category === "Insurance")
    .reduce((sum, p) => sum + annualPremium(p), 0);

  const isVip =
    insurancePremiumYear > VIP_PREMIUM_THRESHOLD ||
    (hasInsurance && hasInvestment);

  const hasLoan = live.some((p) => p.isInvestmentLoan === true);
  const hasCorporate = live.some(
    (p) =>
      p.isCorporateInsurance === true &&
      typeof p.businessName === "string" &&
      p.businessName.trim().length > 0
  );

  const tags: DynamicTag[] = [];
  if (hasInsurance) tags.push("insurance");
  if (hasInvestment) tags.push("investment");
  if (isVip) tags.push("VIP");
  if (hasLoan) tags.push("Loan");
  if (hasCorporate) tags.push("Corporate");
  return tags;
}
