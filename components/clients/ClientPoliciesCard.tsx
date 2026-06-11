"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ExternalLink, FileText, Plus, Search, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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
import type { Policy } from "@/lib/types";
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
  const { updatePolicy } = useData();
  const [expandedList, setExpandedList] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedPolicyIds, setExpandedPolicyIds] = useState<Set<string>>(new Set());
  const [notesPolicyId, setNotesPolicyId] = useState<string | null>(null);

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

  const notesPolicy = notesPolicyId
    ? policies.find((policy) => policy.id === notesPolicyId)
    : undefined;

  function resetPolicyNotes() {
    setNotesPolicyId(null);
  }

  function handlePolicyNoteSave(policy: Policy, note: string) {
    const saved = updatePolicy(policy.id, { notes: note.trim() });
    if (!saved) {
      toast.error("Could not save policy note.");
      return false;
    }
    toast.success(note.trim() ? "Policy note saved" : "Policy note cleared", {
      description: policy.policyNumber ? displayPolicyNumberWithHash(policy.policyNumber) : undefined,
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
                        hasNotes={!!p.notes?.trim()}
                        className={style.row}
                        onToggle={() => togglePolicyDetails(p.id)}
                        onOpenNotes={() => setNotesPolicyId(p.id)}
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
      <PolicyNotesDialog
        open={!!notesPolicyId}
        policy={notesPolicy}
        onOpenChange={(open) => !open && resetPolicyNotes()}
        onSave={handlePolicyNoteSave}
      />
    </WidgetCard>
  );
}

function CompactPolicyRow({
  policy,
  expanded,
  currentViewClientId,
  hasNotes,
  className,
  onToggle,
  onOpenNotes,
}: {
  policy: Policy;
  expanded: boolean;
  currentViewClientId: string;
  hasNotes: boolean;
  className?: string;
  onToggle: () => void;
  onOpenNotes: () => void;
}) {
  const primaryAmountLabel =
    policy.category === "Investment" ? "Initial Amount" : "Total Coverage";
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
  const secondaryInvestmentMetric = policy.isInvestmentLoan
    ? {
        label: "Loan Amount",
        value: formatCurrency(policy.loanAmount || 0),
        helper: policy.lender ? `Lender: ${policy.lender}` : undefined,
      }
    : {
        label: "Ongoing Amount",
        value: policy.ongoingInvestmentAmount ? formatCurrency(policy.ongoingInvestmentAmount) : "—",
        helper: policy.ongoingInvestmentAmount ? `Start Date: ${ongoingDateRange}` : undefined,
      };
  const tertiaryInvestmentMetric =
    policy.isInvestmentLoan && policy.ongoingInvestmentAmount
      ? {
          label: "Ongoing Amount",
          value: formatCurrency(policy.ongoingInvestmentAmount),
          helper: `Start Date: ${ongoingDateRange}`,
        }
      : {
          label: "Frequency",
          value: ongoingFrequency,
          helper: undefined,
        };
  const insuranceDateValue =
    policy.category === "Investment"
      ? "—"
      : policy.premiumDate
        ? formatMonthDay(policy.premiumDate)
        : "—";

  return (
    <div className={cn("transition-colors", className)}>
      <div className="grid grid-cols-1 gap-3 px-5 py-3 lg:grid-cols-[minmax(0,1fr)_9.5rem_9.5rem_8rem_4.75rem] lg:items-center lg:gap-4 md:px-6">
        <div className="flex min-w-0 gap-2 text-left">
          <button
            type="button"
            onClick={onToggle}
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "mt-0.5 shrink-0 text-slate-400 hover:text-navy"
            )}
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} policy summary`}
            title={expanded ? "Collapse details" : "Expand details"}
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                expanded ? "rotate-180" : "rotate-0"
              )}
            />
          </button>
          <div className="min-w-0 flex-1 select-text">
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
          </div>
        </div>

        <Metric
          label={primaryAmountLabel}
          value={formatCurrency(policy.sumAssured)}
          helper={policy.category === "Investment" ? `Effective Date: ${effectiveDateValue}` : undefined}
        />
        <div>
          {policy.category === "Investment" ? (
            <Metric
              label={secondaryInvestmentMetric.label}
              value={secondaryInvestmentMetric.value}
              helper={secondaryInvestmentMetric.helper}
            />
          ) : (
            <Metric
              label="Premium"
              value={`${formatCurrency(policy.premium)} /${PAYMENT_FREQUENCY_LABELS[policy.paymentFrequency].toLowerCase()}`}
            />
          )}
        </div>
        {policy.category === "Investment" ? (
          <Metric
            label={tertiaryInvestmentMetric.label}
            value={tertiaryInvestmentMetric.value}
            helper={tertiaryInvestmentMetric.helper}
          />
        ) : (
          <Metric label="Due Date" value={insuranceDateValue} />
        )}
        <div className="flex justify-start gap-1 lg:justify-end">
          <button
            type="button"
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              hasNotes
                ? "relative text-purple-600 hover:text-purple-700"
                : "text-slate-400 hover:text-purple-600"
            )}
            aria-label={`Open notes for policy ${policy.policyNumber}`}
            title="Policy notes"
            onClick={onOpenNotes}
          >
            <StickyNote className="h-3.5 w-3.5" />
            {hasNotes ? (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-purple-500 ring-2 ring-white">
                <span className="sr-only">This policy has notes</span>
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
                  hasNotes ? "text-purple-600" : "text-slate-400"
                )}
                aria-label={`Open notes for policy ${policy.policyNumber}`}
                title="Policy notes"
                onClick={onOpenNotes}
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

function PolicyNotesDialog({
  open,
  policy,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  policy: Policy | undefined;
  onOpenChange: (open: boolean) => void;
  onSave: (policy: Policy, note: string) => boolean;
}) {
  const [note, setNote] = useState("");
  const currentNote = policy?.notes ?? "";

  useEffect(() => {
    if (open) setNote(currentNote);
  }, [currentNote, open]);

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!policy) return;
    const ok = onSave(policy, note);
    if (!ok) return;
    setNote("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Policy Notes</DialogTitle>
          <p className="text-xs text-slate-500">
            {policy
              ? `${policy.carrier} · ${policy.productName || policy.productType} · ${displayPolicyNumberWithHash(policy.policyNumber)}`
              : ""}
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="rounded-lg bg-purple-50/70 px-3 py-2 text-xs leading-relaxed text-purple-700">
            Use this for policy-specific notes such as riders, underwriting details,
            or special product instructions. It will not be added to Activity Timeline.
          </p>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Example: Term rider, CI rider, special instructions..."
            rows={6}
            className="resize-none text-sm"
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-navy text-white hover:bg-navy/90"
              disabled={!policy || note.trim() === currentNote.trim()}
            >
              Save Notes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
