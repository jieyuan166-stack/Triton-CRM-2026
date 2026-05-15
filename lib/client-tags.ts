// lib/client-tags.ts
// Single source of truth for the dynamic Client tag system.
//
// All tags are derived from client + policy state — never persisted on the
// Client record. Computing on-read avoids drift when policies change.

import { TAG_VALUES, isTagValue, type TagValue } from "./constants";
import { formatCurrency } from "./format";
import type { Client, PaymentFrequency, Policy } from "./types";

export type DynamicTag = TagValue;
export const DYNAMIC_TAGS = TAG_VALUES;

/** Annual insurance premium (CAD) at or above which "VIP" is auto-applied. */
export const VIP_PREMIUM_THRESHOLD = 50_000;

const FREQUENCY_PER_YEAR: Record<PaymentFrequency, number> = {
  Monthly: 12,
  Quarterly: 4,
  "Semi-Annual": 2,
  Annual: 1,
};

function annualPremium(p: Policy): number {
  return p.premium * FREQUENCY_PER_YEAR[p.paymentFrequency];
}

function isValidEmail(email: string | null | undefined): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email ?? "");
}

export function getMissingInformationReasons(client: Client): string[] {
  const reasons: string[] = [];

  if (!client.email?.trim()) {
    reasons.push("Email is missing");
  } else if (!isValidEmail(client.email)) {
    reasons.push("Email format looks invalid");
  }

  if (!client.birthday) reasons.push("Birthday is missing");
  if (!client.streetAddress?.trim()) reasons.push("Street address is missing");
  if (!client.city?.trim()) reasons.push("City is missing");
  if (!client.province) reasons.push("Province is missing");
  if (!client.postalCode?.trim()) reasons.push("Postal code is missing");

  return reasons;
}

export function getVipTagReasons(client: Client, policies: Policy[]): string[] {
  const liveInsurance = policies.filter(
    (p) =>
      p.clientId === client.id &&
      p.status !== "lapsed" &&
      p.category === "Insurance"
  );
  const annualPremiumTotal = liveInsurance.reduce(
    (sum, p) => sum + annualPremium(p),
    0
  );

  const reasons = [
    `VIP rule: annualized insurance premium must be at least ${formatCurrency(
      VIP_PREMIUM_THRESHOLD
    )}.`,
    `Current annualized insurance premium: ${formatCurrency(
      annualPremiumTotal
    )}.`,
  ];

  const topContributors = [...liveInsurance]
    .sort((a, b) => annualPremium(b) - annualPremium(a))
    .slice(0, 3);

  for (const policy of topContributors) {
    reasons.push(
      `${policy.carrier} ${policy.productType}${
        policy.policyNumber ? ` #${policy.policyNumber}` : ""
      }: ${formatCurrency(policy.premium)} ${policy.paymentFrequency} = ${formatCurrency(
        annualPremium(policy)
      )}/year`
    );
  }

  return reasons;
}

export function getDynamicTagReasons(
  client: Client,
  policies: Policy[],
  tag: TagValue
): string[] {
  if (tag === "Missing Information") return getMissingInformationReasons(client);
  if (tag === "VIP") return getVipTagReasons(client, policies);
  return [];
}

/**
 * Compute the dynamic tags for a client. Lapsed policies don't drive tags
 * (they shouldn't keep the client labelled as Insurance / Loan / etc.).
 *
 * Rules:
 * - "insurance"  : any non-lapsed policy with category "Insurance"
 * - "investment" : any non-lapsed policy with category "Investment"
 * - "VIP"        : annual insurance premium total >= $50k
 * - "Loan"       : any non-lapsed policy with isInvestmentLoan === true
 * - "Corporate"  : any non-lapsed policy with isCorporateInsurance === true
 *                  AND a non-empty businessName
 *
 * Returned in a stable display order so tag rows look consistent.
 */
export function calculateAutoClientTags(
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

  const isVip = insurancePremiumYear >= VIP_PREMIUM_THRESHOLD;

  const hasLoan = live.some((p) => p.isInvestmentLoan === true);
  const hasCorporate = live.some(
    (p) =>
      p.isCorporateInsurance === true &&
      typeof p.businessName === "string" &&
      p.businessName.trim().length > 0
  );
  const missingInformation = getMissingInformationReasons(client).length > 0;

  const tags: DynamicTag[] = [];
  if (hasInsurance) tags.push("insurance");
  if (hasInvestment) tags.push("investment");
  if (isVip) tags.push("VIP");
  if (hasLoan) tags.push("Loan");
  if (hasCorporate) tags.push("Corporate");
  if (missingInformation) tags.push("Missing Information");
  return tags;
}

/**
 * Compute visible client tags:
 * - start with dynamic system tags
 * - remove advisor-hidden dynamic tags
 * - add advisor-manual tags
 */
export function calculateClientTags(
  client: Client,
  policies: Policy[]
): DynamicTag[] {
  const auto = calculateAutoClientTags(client, policies);
  const manual = new Set((client.manualTags ?? []).filter(isTagValue));
  const hidden = new Set((client.hiddenTags ?? []).filter(isTagValue));

  return TAG_VALUES.filter(
    (tag) => (auto.includes(tag) && !hidden.has(tag)) || manual.has(tag)
  );
}
