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
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { EmailHistoryEntry, Policy } from "@/lib/types";

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
  const [typeLabel, setTypeLabel] = useState(defaultType);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selectedPolicyId, setSelectedPolicyId] = useState(NO_POLICY_VALUE);

  useEffect(() => {
    if (!open) return;
    setTypeLabel(entry?.templateLabel || entry?.communicationType || defaultType);
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

    const patch: ActivityEntryPatch = {
      subject: cleanSubject,
      body: body.trim(),
      templateLabel: typeLabel.trim() || defaultType,
      communicationType: typeLabel.trim() || defaultType,
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
            <Label htmlFor="activity-entry-type" className="label-caps">
              Type / Label
            </Label>
            <Input
              id="activity-entry-type"
              value={typeLabel}
              onChange={(event) => setTypeLabel(event.target.value)}
              placeholder="e.g. Phone Call, Renewal Reminder"
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
              <SelectTrigger id="activity-entry-policy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_POLICY_VALUE}>No policy target</SelectItem>
                {policies.map((policy) => (
                  <SelectItem key={policy.id} value={policy.id}>
                    {policy.carrier} · {policy.productName || policy.productType} · #{policy.policyNumber}
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
