"use client";

import type { ReactNode } from "react";
import { useData } from "@/components/providers/DataProvider";
import { ClientNameDisplay } from "@/components/ui-shared/ClientNameDisplay";
import { CarrierLogoBadge } from "@/components/ui-shared/CarrierLogoBadge";
import { StatusBadge } from "@/components/ui-shared/StatusBadge";
import { UniversalDataCard, type UniversalDataMetric } from "@/components/ui-shared/UniversalDataCard";
import { CARRIER_COLORS } from "@/lib/carrier-colors";
import { formatDate, formatMonthDay, formatRelative } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/format";
import { partyDisplayName } from "@/lib/policy-parties";
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
  currentViewClientId?: string;
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
      {policy.isJoint ? <StatusBadge kind="joint" /> : null}
      {extraBadges}
    </>
  );
}

function buildPolicyMetrics(policy: Policy): UniversalDataMetric[] {
  const amountLabel = policy.category === "Investment" ? "Initial Amount" : "Death Benefit";
  const dateLabel = policy.category === "Investment" ? "Effective Date" : "Premium Date";

  const metrics: UniversalDataMetric[] = [
    {
      label: amountLabel,
      value: <span className="font-finance">{formatCurrency(policy.sumAssured)}</span>,
    },
  ];

  if (policy.category !== "Investment") {
    metrics.push({
      label: "Premium",
      value: (
        <span className="font-finance">
          {formatCurrency(policy.premium)}
          <span className="text-[10px] font-normal text-triton-muted">
            /{PAYMENT_FREQUENCY_LABELS[policy.paymentFrequency].toLowerCase()}
          </span>
        </span>
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
  currentViewClientId,
}: PolicyDataCardProps) {
  const { getClient } = useData();
  const policyOwner = getClient(policy.clientId);
  const jointPartner = policy.jointWithClientId
    ? getClient(policy.jointWithClientId)
    : undefined;
  const jointDisplayClient =
    policy.isJoint && currentViewClientId && currentViewClientId === policy.jointWithClientId
      ? policyOwner
      : jointPartner;
  const displayPolicyOwner =
    policy.policyOwnerClientId && getClient(policy.policyOwnerClientId)
      ? `${getClient(policy.policyOwnerClientId)?.firstName} ${getClient(policy.policyOwnerClientId)?.lastName}`.trim()
      : policy.policyOwnerName || `${policyOwner?.firstName ?? ""} ${policyOwner?.lastName ?? ""}`.trim();
  const displayPolicyOwner2 =
    policy.policyOwner2ClientId && getClient(policy.policyOwner2ClientId)
      ? `${getClient(policy.policyOwner2ClientId)?.firstName} ${getClient(policy.policyOwner2ClientId)?.lastName}`.trim()
      : policy.policyOwner2Name;
  const ownerDisplay = [displayPolicyOwner, displayPolicyOwner2]
    .filter(Boolean)
    .join(" / ");
  const insuredDisplay =
    policy.category === "Insurance"
      ? ((policy.insuredPersons?.length
          ? policy.insuredPersons
          : [
              displayPolicyOwner ? { name: displayPolicyOwner } : undefined,
            ].filter(Boolean)) as NonNullable<Policy["insuredPersons"]>)
          .map((person) => partyDisplayName(person, getClient))
          .filter(Boolean)
          .join(" / ")
      : "";
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
      subtitle={
        <>
          <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <CarrierLogoBadge carrier={policy.carrier} size="sm" />
              <span className="font-semibold text-slate-700">{policy.carrier}</span>
            </span>
            <span>{` · ${policy.productType} · #${policy.policyNumber}`}</span>
          </span>
          {jointDisplayClient ? (
            <span className="mt-1 block text-purple-600">
              Joint with {jointDisplayClient.firstName} {jointDisplayClient.lastName}
            </span>
          ) : null}
          {ownerDisplay || insuredDisplay ? (
            <span className="mt-1 block text-[11px] text-slate-500">
              {ownerDisplay ? `Owner: ${ownerDisplay}` : ""}
              {ownerDisplay && insuredDisplay ? " · " : ""}
              {insuredDisplay ? `Insured: ${insuredDisplay}` : ""}
            </span>
          ) : null}
        </>
      }
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
