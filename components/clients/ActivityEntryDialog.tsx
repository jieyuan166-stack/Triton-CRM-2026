"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  MANUAL_COMMUNICATION_TYPES,
  parseCommunicationTypes,
  serializeCommunicationTypes,
} from "@/lib/communication-log";
import { displayPolicyNumberWithHash } from "@/lib/policy-number";
import type { EmailHistoryEntry, Policy } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ActivityEntryPatch = Partial<
  Pick<
    EmailHistoryEntry,
    "subject" | "body" | "templateLabel" | "communicationType"
  >
> & {
  policyId?: string | null;
  policyNumber?: string | null;
  policyLabel?: string | null;
};

interface ActivityEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  policies: Policy[];
  entry?: EmailHistoryEntry;
  defaultPolicyId?: string;
  defaultType?: string;
  title?: string;
  onSave: (patch: ActivityEntryPatch) => boolean | void;
}

const NO_POLICY_VALUE = "__none__";

function policyLabel(policy: Policy): string {
  return `${policy.carrier} ${policy.productName || policy.productType}`.trim();
}

function policyDisplayName(policy: Policy): string {
  const product = policy.productName || policy.productType || "Policy";
  return `${product} · ${policy.carrier} · ${displayPolicyNumberWithHash(policy.policyNumber)}`;
}

function policyShortDisplayName(policy: Policy): string {
  const product = policy.productName || policy.productType || "Policy";
  const shortProduct = product.length > 28 ? `${product.slice(0, 27).trim()}…` : product;
  return `${shortProduct} · ${displayPolicyNumberWithHash(policy.policyNumber)}`;
}

function splitKnownAndCustom(label: string) {
  const parts = parseCommunicationTypes(label);
  const known = parts.filter((item) =>
    MANUAL_COMMUNICATION_TYPES.includes(item as (typeof MANUAL_COMMUNICATION_TYPES)[number])
  );
  const custom = parts.filter(
    (item) =>
      !MANUAL_COMMUNICATION_TYPES.includes(item as (typeof MANUAL_COMMUNICATION_TYPES)[number])
  );
  return { known, custom: custom.join(" + ") };
}

function resolveInitialPolicyId(
  policies: Policy[],
  entry: EmailHistoryEntry | undefined,
  defaultPolicyId: string | undefined
) {
  if (entry?.policyId && policies.some((policy) => policy.id === entry.policyId)) {
    return entry.policyId;
  }
  if (entry?.policyNumber) {
    const byNumber = policies.find((policy) => policy.policyNumber === entry.policyNumber);
    if (byNumber) return byNumber.id;
  }
  return defaultPolicyId && policies.some((policy) => policy.id === defaultPolicyId)
    ? defaultPolicyId
    : NO_POLICY_VALUE;
}

export function ActivityEntryDialog({
  open,
  onOpenChange,
  mode,
  policies,
  entry,
  defaultPolicyId,
  defaultType = "Note",
  title,
  onSave,
}: ActivityEntryDialogProps) {
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [customType, setCustomType] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selectedPolicyId, setSelectedPolicyId] = useState(NO_POLICY_VALUE);

  useEffect(() => {
    if (!open) return;
    const initialType = entry?.templateLabel || entry?.communicationType || defaultType;
    const split = splitKnownAndCustom(initialType);
    setSelectedTypes(split.known.length > 0 ? split.known : []);
    setCustomType(split.custom);
    setSubject(entry?.subject ?? "");
    setBody(entry?.body ?? "");
    setSelectedPolicyId(resolveInitialPolicyId(policies, entry, defaultPolicyId));
  }, [defaultPolicyId, defaultType, entry, open, policies]);

  const selectedPolicy = useMemo(
    () => policies.find((policy) => policy.id === selectedPolicyId),
    [policies, selectedPolicyId]
  );

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const cleanSubject = subject.trim();
    if (!cleanSubject) return;
    const typeLabel =
      serializeCommunicationTypes([...selectedTypes, customType]) || defaultType;

    const patch: ActivityEntryPatch = {
      subject: cleanSubject,
      body: body.trim(),
      templateLabel: typeLabel,
      communicationType: typeLabel,
      policyId: selectedPolicy ? selectedPolicy.id : null,
      policyNumber: selectedPolicy ? selectedPolicy.policyNumber : null,
      policyLabel: selectedPolicy ? policyLabel(selectedPolicy) : null,
    };
    const ok = onSave(patch);
    if (ok === false) return;
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {title ?? (mode === "edit" ? "Edit Activity" : "Add Activity")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="label-caps">
              Type / Label
            </Label>
            <div className="flex flex-wrap gap-2">
              {MANUAL_COMMUNICATION_TYPES.map((type) => {
                const selected = selectedTypes.includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() =>
                      setSelectedTypes((current) =>
                        selected
                          ? current.filter((item) => item !== type)
                          : [...current, type]
                      )
                    }
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                      selected
                        ? "border-navy bg-navy text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
                    )}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
            <Input
              id="activity-entry-type"
              value={customType}
              onChange={(event) => setCustomType(event.target.value)}
              placeholder="Custom label, e.g. Renewal Reminder"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="activity-entry-policy" className="label-caps">
              Target Policy
            </Label>
            <Select
              value={selectedPolicyId}
              onValueChange={(value) => setSelectedPolicyId(value ?? NO_POLICY_VALUE)}
            >
              <SelectTrigger id="activity-entry-policy" className="w-full max-w-full">
                <span className="min-w-0 flex-1 truncate text-left">
                  {selectedPolicy
                    ? policyShortDisplayName(selectedPolicy)
                    : "No policy target"}
                </span>
              </SelectTrigger>
              <SelectContent
                align="start"
                sideOffset={8}
                className="w-[var(--anchor-width)] max-w-[min(34rem,calc(100vw-2rem))]"
              >
                <SelectItem value={NO_POLICY_VALUE}>No policy target</SelectItem>
                {policies.map((policy) => (
                  <SelectItem
                    key={policy.id}
                    value={policy.id}
                    className="items-start whitespace-normal"
                  >
                    <span className="min-w-0 whitespace-normal break-words leading-snug">
                    {policyDisplayName(policy)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="activity-entry-summary" className="label-caps">
              Summary <span className="text-accent-red">*</span>
            </Label>
            <Input
              id="activity-entry-summary"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="e.g. Discussed premium payment"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="activity-entry-details" className="label-caps">
              Details
            </Label>
            <Textarea
              id="activity-entry-details"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Optional details..."
              rows={4}
              className="resize-none"
            />
          </div>

          <DialogFooter className="-mx-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-navy text-white hover:bg-navy/90" disabled={!subject.trim()}>
              {mode === "edit" ? "Save Changes" : "Save Activity"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
