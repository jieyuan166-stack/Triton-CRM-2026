"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, Copy, ExternalLink, FileText, Plus, Search, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ActivityEntryDialog,
  type ActivityEntryPatch,
} from "@/components/clients/ActivityEntryDialog";
import { useData } from "@/components/providers/DataProvider";
import { WidgetCard } from "@/components/ui-shared/WidgetCard";
import { EmptyState } from "@/components/ui-shared/EmptyState";
import { PolicyDataCard } from "@/components/ui-shared/PolicyDataCard";
import { CarrierLogoBadge } from "@/components/ui-shared/CarrierLogoBadge";
import { StatusBadge } from "@/components/ui-shared/StatusBadge";
import { formatDate, formatMonthDay } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/format";
import { insuranceProductTone, investmentProductTone } from "@/lib/investment-product-style";
import { displayPolicyNumberWithHash } from "@/lib/policy-number";
import { parseCommunicationTypes } from "@/lib/communication-log";
import type { EmailHistoryEntry, Policy } from "@/lib/types";
import { CARRIERS, PAYMENT_FREQUENCY_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

const CATEGORY_SECTION_STYLE = {
  Insurance: {
    label: "Insurance Policies",
    description: "Coverage and premium schedule",
    badge: "bg-blue-50 text-blue-700 ring-blue-100",
    row: "hover:bg-blue-50/40",
  },
  Investment: {
    label: "Investment Policies",
    description: "Investment assets and loan details",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    row: "hover:bg-emerald-50/40",
  },
} as const;

interface ClientPoliciesCardProps {
  clientId: string;
  policies: Policy[];
}

const DEFAULT_VISIBLE_COUNT = 5;

function clusterByCarrier(items: Policy[]) {
  return [...items].sort((a, b) => {
    const carrierOrder = CARRIERS.indexOf(a.carrier) - CARRIERS.indexOf(b.carrier);
    if (carrierOrder !== 0) return carrierOrder;
    return (a.productName || a.productType).localeCompare(b.productName || b.productType);
  });
}

export function ClientPoliciesCard({ clientId, policies }: ClientPoliciesCardProps) {
  const { appendEmailHistory, updateEmailHistory, getClient } = useData();
  const [expandedList, setExpandedList] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedPolicyIds, setExpandedPolicyIds] = useState<Set<string>>(new Set());
  const [activityPolicyId, setActivityPolicyId] = useState<string | null>(null);
  const [entryDialog, setEntryDialog] = useState<
    { mode: "create"; policyId: string } | { mode: "edit"; entry: EmailHistoryEntry } | null
  >(null);
  const client = getClient(clientId);
  const history = useMemo(() => client?.emailHistory ?? [], [client?.emailHistory]);

  const filteredPolicies = useMemo(() => {
    const q = query.trim().toLowerCase();
    return policies.filter((policy) => {
      const haystack = [
        policy.policyNumber,
        policy.productName,
        policy.productType,
        policy.carrier,
        policy.category,
        policy.status,
        policy.lender,
        policy.businessName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (q && !haystack.includes(q)) return false;
      return true;
    });
  }, [policies, query]);

  const visiblePolicies = expandedList
    ? filteredPolicies
    : filteredPolicies.slice(0, DEFAULT_VISIBLE_COUNT);
  const hiddenCount = Math.max(filteredPolicies.length - visiblePolicies.length, 0);

  const policySections = useMemo(
    () =>
      (["Insurance", "Investment"] as const)
        .map((category) => ({
          category,
          policies: clusterByCarrier(visiblePolicies.filter((p) => p.category === category)),
          style: CATEGORY_SECTION_STYLE[category],
        }))
        .filter((s) => s.policies.length > 0),
    [visiblePolicies]
  );

  function togglePolicyDetails(id: string) {
    setExpandedPolicyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const activityPolicy = activityPolicyId
    ? policies.find((policy) => policy.id === activityPolicyId)
    : undefined;
  const activityEntries = activityPolicy
    ? history
        .filter(
          (entry) =>
            entry.policyId === activityPolicy.id ||
            (!!activityPolicy.policyNumber && entry.policyNumber === activityPolicy.policyNumber)
        )
        .sort((a, b) => (a.date > b.date ? -1 : 1))
    : [];
  const activityCountByPolicyId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const policy of policies) {
      const count = history.filter(
        (entry) =>
          entry.policyId === policy.id ||
          (!!policy.policyNumber && entry.policyNumber === policy.policyNumber)
      ).length;
      if (count > 0) counts.set(policy.id, count);
    }
    return counts;
  }, [history, policies]);

  function resetPolicyActivity() {
    setActivityPolicyId(null);
    setEntryDialog(null);
  }

  function handlePolicyActivitySave(patch: ActivityEntryPatch) {
    if (entryDialog?.mode === "edit") {
      const updated = updateEmailHistory(clientId, entryDialog.entry.id, patch);
      if (!updated) {
        toast.error("Could not update policy activity.");
        return false;
      }
      toast.success("Policy activity updated");
      return true;
    }
    const saved = appendEmailHistory(clientId, {
      subject: patch.subject ?? "",
      body: patch.body ?? "",
      templateLabel: patch.templateLabel,
      policyId: patch.policyId ?? undefined,
      policyNumber: patch.policyNumber ?? undefined,
      policyLabel: patch.policyLabel ?? undefined,
      communicationType: patch.communicationType,
    });
    if (!saved) {
      toast.error("Could not save policy note.");
      return false;
    }
    toast.success("Policy activity added", {
      description: patch.policyNumber ? `#${patch.policyNumber}` : undefined,
    });
    return true;
  }

  return (
    <WidgetCard
      title="Policies"
      description={`${policies.length} total${filteredPolicies.length !== policies.length ? ` · ${filteredPolicies.length} shown` : ""}`}
      bodyFlush
      action={
        <Link href={`/policies/new?clientId=${clientId}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8")}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Link>
      }
    >
      {policies.length === 0 ? (
        <EmptyState icon={FileText} title="No policies yet" description="Add the first policy for this client." compact />
      ) : (
        <div>
          <div className="border-b border-slate-100 px-5 pb-4 md:px-6">
            <div className="relative min-w-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-300" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search policy, carrier, number..."
                  className="h-9 pl-9"
                />
            </div>
          </div>

          {filteredPolicies.length === 0 ? (
            <EmptyState icon={Search} title="No matching policies" description="Try another policy number, carrier, or filter." compact />
          ) : (
        <div className="divide-y divide-slate-100">
          {policySections.map(({ category, policies: sectionPolicies, style }) => (
            <section key={category}>
              <div className="flex items-center justify-between gap-3 bg-slate-50/60 px-5 py-2.5 md:px-6">
                <div className="min-w-0">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{style.label}</h4>
                  <p className="text-[11px] text-slate-400">{style.description}</p>
                </div>
                <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold font-number ring-1", style.badge)}>
                  {sectionPolicies.length}
                </span>
              </div>

              <ul className="divide-y divide-slate-100">
                {sectionPolicies.map((p) => (
                    <li key={p.id}>
                      <CompactPolicyRow
                        policy={p}
                        expanded={expandedPolicyIds.has(p.id)}
                        currentViewClientId={clientId}
                        activityCount={activityCountByPolicyId.get(p.id) ?? 0}
                        className={style.row}
                        onToggle={() => togglePolicyDetails(p.id)}
                        onOpenActivity={() => setActivityPolicyId(p.id)}
                      />
                    </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
          )}

          {hiddenCount > 0 || expandedList ? (
            <div className="border-t border-slate-100 px-5 py-3 text-center md:px-6">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpandedList((value) => !value)}
              >
                {expandedList ? "Show less" : `View all ${filteredPolicies.length} policies`}
                <ChevronDown
                  className={cn(
                    "ml-1.5 h-3.5 w-3.5 transition-transform",
                    expandedList ? "rotate-180" : ""
                  )}
                />
              </Button>
            </div>
          ) : null}
        </div>
      )}
      <Dialog open={!!activityPolicyId} onOpenChange={(open) => !open && resetPolicyActivity()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Policy Activity</DialogTitle>
            <p className="text-xs text-slate-500">
              {activityPolicy
                ? `${activityPolicy.carrier} · ${activityPolicy.productName || activityPolicy.productType} · #${activityPolicy.policyNumber}`
                : ""}
            </p>
          </DialogHeader>

          {activityEntries.length > 0 ? (
            <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/70 p-3">
              {activityEntries.slice(0, 5).map((entry) => (
                <div key={entry.id} className="rounded-md bg-white px-3 py-2 ring-1 ring-slate-100">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {parseCommunicationTypes(entry.templateLabel || entry.communicationType).map((type) => (
                      <span
                        key={type}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500"
                      >
                        {type}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 text-xs font-medium text-slate-800">
                    {entry.subject || "Activity"}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-slate-400">
                      {formatDate(entry.date)}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[11px] text-slate-400 hover:text-navy"
                      onClick={() => setEntryDialog({ mode: "edit", entry })}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 px-4 py-5 text-center text-sm text-slate-400">
              No policy activity yet.
            </div>
          )}
          {activityPolicy ? (
            <div className="flex justify-end">
              <Button
                type="button"
                className="bg-navy text-white hover:bg-navy/90"
                onClick={() => setEntryDialog({ mode: "create", policyId: activityPolicy.id })}
              >
                Add Activity
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <ActivityEntryDialog
        open={!!entryDialog}
        onOpenChange={(open) => {
          if (!open) setEntryDialog(null);
        }}
        mode={entryDialog?.mode ?? "create"}
        policies={policies}
        entry={entryDialog?.mode === "edit" ? entryDialog.entry : undefined}
        defaultPolicyId={
          entryDialog?.mode === "create"
            ? entryDialog.policyId
            : activityPolicy?.id
        }
        defaultType="Note"
        onSave={handlePolicyActivitySave}
        title={entryDialog?.mode === "edit" ? "Edit Policy Activity" : "Add Policy Activity"}
      />
    </WidgetCard>
  );
}

function CompactPolicyRow({
  policy,
  expanded,
  currentViewClientId,
  activityCount,
  className,
  onToggle,
  onOpenActivity,
}: {
  policy: Policy;
  expanded: boolean;
  currentViewClientId: string;
  activityCount: number;
  className?: string;
  onToggle: () => void;
  onOpenActivity: () => void;
}) {
  const primaryAmountLabel =
    policy.category === "Investment" ? "Initial Amount" : "Death Benefit";
  const effectiveDateValue = policy.effectiveDate ? formatDate(policy.effectiveDate) : "—";
  const ongoingStartValue = policy.ongoingInvestmentStartDate
    ? formatDate(policy.ongoingInvestmentStartDate)
    : "—";
  const ongoingDateRange = policy.ongoingInvestmentEndDate
    ? `${ongoingStartValue} – ${formatDate(policy.ongoingInvestmentEndDate)}`
    : ongoingStartValue;
  const ongoingFrequency =
    policy.ongoingInvestmentFrequency === "Custom"
      ? policy.ongoingInvestmentFrequencyCustom || "Custom"
      : policy.ongoingInvestmentFrequency || "—";
  const insuranceDateValue =
    policy.category === "Investment"
      ? "—"
      : policy.premiumDate
        ? formatMonthDay(policy.premiumDate)
        : "—";

  async function copyPolicySummary() {
    const lines = [
      `Carrier: ${policy.carrier}`,
      `Product: ${policy.productName || policy.productType}`,
      `Policy Number: ${displayPolicyNumberWithHash(policy.policyNumber)}`,
      `Category: ${policy.category}`,
      `Product Type: ${policy.productType}`,
      policy.category === "Investment"
        ? `Initial Amount: ${formatCurrency(policy.sumAssured)}`
        : `Death Benefit: ${formatCurrency(policy.sumAssured)}`,
    ];

    if (policy.category === "Investment") {
      lines.push(`Effective Date: ${effectiveDateValue}`);
      if (policy.ongoingInvestmentAmount) {
        lines.push(`Ongoing Amount: ${formatCurrency(policy.ongoingInvestmentAmount)}`);
        lines.push(`Frequency: ${ongoingFrequency}`);
        lines.push(`Start Date: ${ongoingStartValue}`);
        if (policy.ongoingInvestmentEndDate) {
          lines.push(`End Date: ${formatDate(policy.ongoingInvestmentEndDate)}`);
        }
      }
    } else {
      lines.push(
        `Premium: ${formatCurrency(policy.premium)} /${PAYMENT_FREQUENCY_LABELS[policy.paymentFrequency].toLowerCase()}`
      );
      lines.push(`Due Date: ${insuranceDateValue}`);
    }

    if (policy.status !== "active") lines.push(`Status: ${policy.status}`);
    if (policy.isInvestmentLoan) lines.push(`Loan: ${policy.lender || "Investment Loan"}`);
    if (policy.isJoint) lines.push("Joint Account: Yes");

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("Policy summary copied");
    } catch {
      toast.error("Could not copy policy summary");
    }
  }

  return (
    <div className={cn("transition-colors", className)}>
      <div className="grid grid-cols-1 gap-3 px-5 py-3 lg:grid-cols-[minmax(0,1fr)_9.5rem_9.5rem_8rem_7rem] lg:items-center lg:gap-4 md:px-6">
        <button
          type="button"
          onClick={onToggle}
          className="min-w-0 text-left"
          aria-expanded={expanded}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <CarrierLogoBadge carrier={policy.carrier} size="sm" />
            <span className="text-sm font-medium text-slate-900">
              {policy.productName || policy.productType}
            </span>
            <span className="text-xs text-slate-400">{displayPolicyNumberWithHash(policy.policyNumber)}</span>
            {policy.isJoint ? <StatusBadge kind="joint" /> : null}
            {policy.category === "Investment" && policy.isInvestmentLoan ? (
              <StatusBadge kind="loan" lender={policy.lender} />
            ) : (
              <StatusBadge kind={policy.category === "Investment" ? "investment" : "insurance"} />
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {policy.carrier} ·{" "}
            <span
              className={cn(
                "font-bold",
                policy.category === "Investment"
                  ? investmentProductTone(policy.productType)
                  : insuranceProductTone(policy.productType)
              )}
            >
              {policy.productType}
            </span>
            {policy.status !== "active" ? ` · ${policy.status}` : ""}
          </p>
        </button>

        <Metric
          label={primaryAmountLabel}
          value={formatCurrency(policy.sumAssured)}
          helper={policy.category === "Investment" ? `Effective Date: ${effectiveDateValue}` : undefined}
        />
        <div>
          {policy.category === "Investment" ? (
            <Metric
              label="Ongoing Amount"
              value={policy.ongoingInvestmentAmount ? formatCurrency(policy.ongoingInvestmentAmount) : "—"}
              helper={
                policy.ongoingInvestmentAmount
                  ? `Start Date: ${ongoingDateRange}`
                  : undefined
              }
            />
          ) : (
            <Metric
              label="Premium"
              value={`${formatCurrency(policy.premium)} /${PAYMENT_FREQUENCY_LABELS[policy.paymentFrequency].toLowerCase()}`}
            />
          )}
        </div>
        {policy.category === "Investment" ? (
          <Metric label="Frequency" value={ongoingFrequency} />
        ) : (
          <Metric label="Due Date" value={insuranceDateValue} />
        )}
        <div className="flex justify-start gap-1 lg:justify-end">
          <button
            type="button"
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "text-slate-400 hover:text-navy"
            )}
            aria-label={`Copy policy summary for ${policy.policyNumber}`}
            title="Copy policy summary"
            onClick={copyPolicySummary}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              activityCount > 0
                ? "relative text-purple-600 hover:text-purple-700"
                : "text-slate-400 hover:text-purple-600"
            )}
            aria-label={`Open activity for policy ${policy.policyNumber}`}
            onClick={onOpenActivity}
          >
            <StickyNote className="h-3.5 w-3.5" />
            {activityCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-purple-100 px-1 text-[9px] font-semibold text-purple-700 ring-1 ring-white">
                {activityCount}
              </span>
            ) : null}
          </button>
          <Link
            href={`/policies/${policy.id}`}
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "text-slate-400 hover:text-navy"
            )}
            aria-label={`Open policy ${policy.policyNumber}`}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-slate-100 bg-slate-50/40 px-5 py-3 md:px-6">
          <PolicyDataCard
            policy={policy}
            href={`/policies/${policy.id}`}
            currentViewClientId={currentViewClientId}
            actions={
              <button
                type="button"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "icon-sm" }),
                  activityCount > 0 ? "text-purple-600" : "text-slate-400"
                )}
                aria-label={`Open activity for policy ${policy.policyNumber}`}
                onClick={onOpenActivity}
              >
                <StickyNote className="h-3.5 w-3.5" />
              </button>
            }
            className="rounded-xl border border-slate-100 bg-white shadow-none"
          />
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="min-w-0 lg:text-right">
      <p className="label-caps leading-none">{label}</p>
      <p className="mt-1 whitespace-nowrap font-finance text-xs font-medium text-slate-800">
        {value}
      </p>
      {helper ? (
        <p className="mt-1 text-[9px] font-medium leading-tight text-triton-muted">
          {helper}
        </p>
      ) : null}
    </div>
  );
}
