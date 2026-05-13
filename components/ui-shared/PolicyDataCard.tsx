"use client";

import type { ReactNode } from "react";
import { ClientNameDisplay } from "@/components/ui-shared/ClientNameDisplay";
import { StatusBadge } from "@/components/ui-shared/StatusBadge";
import { UniversalDataCard, type UniversalDataMetric } from "@/components/ui-shared/UniversalDataCard";
import { CARRIER_COLORS } from "@/lib/carrier-colors";
import { formatDate, formatMonthDay, formatRelative } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/format";
import { PAYMENT_FREQUENCY_LABELS, type Client, type Policy } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface PolicyDataCardProps {
  policy: Policy;
  href?: string;
  owner?: Client;
  ownerIsVip?: boolean;
  extraBadges?: ReactNode;
  actions?: ReactNode;
  className?: string;
  ownerBadgeClassName?: string;
}

function buildPolicyBadges(policy: Policy, extraBadges?: ReactNode) {
  const primary =
    policy.category === "Investment" && policy.isInvestmentLoan ? (
      <StatusBadge kind="loan" lender={policy.lender} />
    ) : (
      <StatusBadge kind={policy.category === "Investment" ? "investment" : "insurance"} />
    );

  return (
    <>
      {primary}
      {policy.isCorporateInsurance && policy.businessName ? (
        <StatusBadge kind="corporate" label="CORPORATE" />
      ) : null}
      {extraBadges}
    </>
  );
}

function buildPolicyMetrics(policy: Policy): UniversalDataMetric[] {
  const amountLabel = policy.category === "Investment" ? "Initial Amount" : "Face Amount";
  const dateLabel = policy.category === "Investment" ? "Effective Date" : "Premium Date";

  const metrics: UniversalDataMetric[] = [
    {
      label: amountLabel,
      value: formatCurrency(policy.sumAssured),
    },
  ];

  if (policy.category !== "Investment") {
    metrics.push({
      label: "Premium",
      value: (
        <>
          {formatCurrency(policy.premium)}
          <span className="text-[10px] font-normal text-triton-muted">
            /{PAYMENT_FREQUENCY_LABELS[policy.paymentFrequency].toLowerCase()}
          </span>
        </>
      ),
    });
  }

  metrics.push({
    label: dateLabel,
    value:
      policy.category === "Investment"
        ? policy.effectiveDate
          ? formatDate(policy.effectiveDate)
          : "—"
        : policy.premiumDate
          ? formatMonthDay(policy.premiumDate)
          : "—",
    helper:
      policy.premiumDate && policy.category !== "Investment"
        ? formatRelative(policy.premiumDate)
        : undefined,
  });

  return metrics;
}

export function PolicyDataCard({
  policy,
  href,
  owner,
  ownerIsVip = false,
  extraBadges,
  actions,
  className,
  ownerBadgeClassName,
}: PolicyDataCardProps) {
  const ownerBadge = owner ? (
    <span
      className={cn(
        "inline-flex min-h-5 items-center rounded-md bg-slate-50 px-2 py-0.5 text-[10px] font-semibold leading-none tracking-wider text-slate-600 ring-1 ring-slate-100",
        ownerBadgeClassName
      )}
    >
      <ClientNameDisplay
        firstName={owner.firstName}
        lastName={owner.lastName}
        isVip={ownerIsVip}
        size="xs"
      />
    </span>
  ) : null;

  return (
    <UniversalDataCard
      href={href}
      accentColor={CARRIER_COLORS[policy.carrier]}
      title={policy.productName || policy.productType}
      subtitle={`${policy.carrier} · ${policy.productType} · #${policy.policyNumber}`}
      badges={buildPolicyBadges(policy, (
        <>
          {ownerBadge}
          {extraBadges}
        </>
      ))}
      actions={actions}
      metrics={buildPolicyMetrics(policy)}
      metricsClassName={policy.category === "Investment" ? "sm:grid-cols-2" : "sm:grid-cols-3"}
      className={className}
    />
  );
}
