"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing, Repeat2 } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { displayPolicyNumberWithHash } from "@/lib/policy-number";
import {
  FOLLOW_UP_IMPORTANCE,
  FOLLOW_UP_TYPES,
  type FollowUp,
  type FollowUpImportance,
  type FollowUpType,
  type Policy,
} from "@/lib/types";

interface FollowUpEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  policies: Policy[];
  onSave: (input: Omit<FollowUp, "id" | "createdAt">) => Promise<FollowUp | null | undefined>;
}

const NO_IMPORTANCE = "__none__";
const NO_POLICY = "__none__";

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export function FollowUpEntryDialog({
  open,
  onOpenChange,
  clientId,
  policies,
  onSave,
}: FollowUpEntryDialogProps) {
  const { session } = useAuth();
  const [type, setType] = useState<FollowUpType>("Phone");
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);
  const [deadline, setDeadline] = useState("");
  const [importance, setImportance] = useState<FollowUpImportance | "">("");
  const [selectedPolicyId, setSelectedPolicyId] = useState(NO_POLICY);
  const [repeatAnnually, setRepeatAnnually] = useState(false);
  const [emailReminder, setEmailReminder] = useState(false);
  const [deadlineError, setDeadlineError] = useState("");

  useEffect(() => {
    if (!open) return;
    setType("Phone");
    setSummary("");
    setDetails("");
    setDeadline("");
    setImportance("");
    setSelectedPolicyId(NO_POLICY);
    setRepeatAnnually(false);
    setEmailReminder(false);
    setDeadlineError("");
  }, [open]);

  const selectedPolicy = policies.find((policy) => policy.id === selectedPolicyId);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const cleanSummary = summary.trim();
    if (!cleanSummary) return;
    if ((repeatAnnually || emailReminder) && !deadline) {
      setDeadlineError("Choose the annual event date to use repeating or email reminders.");
      return;
    }

    if (saving) return;
    setSaving(true);
    try {
    const saved = await onSave({
      clientId,
      type,
      date: todayDate(),
      summary: cleanSummary,
      details: details.trim() || undefined,
      deadline: deadline || undefined,
      importance: importance || undefined,
      policyId: selectedPolicy?.id,
      policyNumber: selectedPolicy?.policyNumber,
      policyLabel: selectedPolicy
        ? `${selectedPolicy.carrier} ${selectedPolicy.productName || selectedPolicy.productType}`.trim()
        : undefined,
      recurrence: repeatAnnually ? "yearly" : undefined,
      reminderLeadDays: emailReminder ? 30 : undefined,
      createdById: session?.user?.id ?? "user",
      createdByName:
        session?.user?.name ?? session?.user?.email ?? "Advisor",
    });
    if (saved === null) return;
    onOpenChange(false);
    } catch (error) {
      toast.error("Follow-up not saved", { description: error instanceof Error ? error.message : "Please try again." });
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !saving && onOpenChange(value)}>
      <DialogContent className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Follow-up</DialogTitle>
          <p className="text-xs text-slate-500">
            Create a structured task with optional deadline and importance. Time is recorded automatically.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="followup-type" className="label-caps">Type</Label>
              <Select value={type} onValueChange={(value) => setType(value as FollowUpType)}>
                <SelectTrigger id="followup-type" className="w-full bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" sideOffset={8}>
                  {FOLLOW_UP_TYPES.map((item) => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="followup-importance" className="label-caps">Importance</Label>
              <Select
                value={importance || NO_IMPORTANCE}
                onValueChange={(value) =>
                  setImportance(value === NO_IMPORTANCE ? "" : (value as FollowUpImportance))
                }
              >
                <SelectTrigger id="followup-importance" className="w-full bg-white">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent align="start" sideOffset={8}>
                  <SelectItem value={NO_IMPORTANCE}>No importance</SelectItem>
                  {FOLLOW_UP_IMPORTANCE.map((item) => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="followup-summary" className="label-caps">
              Summary <span className="text-accent-red">*</span>
            </Label>
            <Input
              id="followup-summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="e.g. Review policy options before renewal"
              required
            />
            <p className="text-[11px] text-slate-400">
              Required. Cancel closes the dialog without saving.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="followup-deadline" className="label-caps">Deadline</Label>
            <Input
              id="followup-deadline"
              type="date"
              value={deadline}
              onChange={(event) => {
                setDeadline(event.target.value);
                setDeadlineError("");
              }}
              aria-invalid={!!deadlineError}
              aria-describedby={deadlineError ? "followup-deadline-error" : "followup-deadline-help"}
            />
            <p id="followup-deadline-help" className="text-[11px] text-slate-400">
              Optional. Leave blank for a high-priority or general follow-up.
            </p>
            {deadlineError ? (
              <p id="followup-deadline-error" role="alert" className="text-xs font-medium text-rose-600">
                {deadlineError}
              </p>
            ) : null}
          </div>

          <div className="space-y-2 rounded-lg border border-[#C99A3A]/35 bg-[#C99A3A]/5 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8A6828]">
              Reminder Schedule
            </p>
            <label className="flex cursor-pointer items-start gap-2.5 text-left">
              <Checkbox
                checked={repeatAnnually}
                onCheckedChange={(checked) => {
                  setRepeatAnnually(checked === true);
                  setDeadlineError("");
                }}
                aria-label="Annual follow-up"
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <Repeat2 className="h-3.5 w-3.5 text-[#9A7429]" />
                  Annual follow-up
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">
                  After you manually mark this year done, the same task is created for next year.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5 border-t border-[#C99A3A]/20 pt-2">
              <Checkbox
                checked={emailReminder}
                onCheckedChange={(checked) => {
                  setEmailReminder(checked === true);
                  setDeadlineError("");
                }}
                aria-label="Advisor email reminder 30 days before"
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <BellRing className="h-3.5 w-3.5 text-[#9A7429]" />
                  Advisor email reminder · 30 days before
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">
                  Sends once to your advisor sign-in email after 8:00 AM Vancouver time. It is never sent to the client.
                </span>
              </span>
            </label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="followup-policy" className="label-caps">Target Policy</Label>
            <Select
              value={selectedPolicyId}
              onValueChange={(value) => setSelectedPolicyId(value || NO_POLICY)}
            >
              <SelectTrigger id="followup-policy" className="w-full bg-white">
                <span className="min-w-0 flex-1 text-left">
                  {selectedPolicy ? (
                    <span className="block min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-700">
                        {selectedPolicy.productName || selectedPolicy.productType}
                      </span>
                      <span className="block truncate text-[11px] text-slate-400">
                        {selectedPolicy.carrier} · {displayPolicyNumberWithHash(selectedPolicy.policyNumber)}
                      </span>
                    </span>
                  ) : (
                    "No policy target"
                  )}
                </span>
              </SelectTrigger>
              <SelectContent
                align="start"
                sideOffset={8}
                className="w-[var(--anchor-width)] max-w-[min(34rem,calc(100vw-2rem))]"
              >
                <SelectItem value={NO_POLICY}>No policy target</SelectItem>
                {policies.map((policy) => (
                  <SelectItem key={policy.id} value={policy.id} className="items-start whitespace-normal">
                    <span className="block min-w-0 whitespace-normal leading-snug">
                      <span className="block break-words font-medium text-slate-700">
                        {policy.productName || policy.productType}
                      </span>
                      <span className="block break-words text-xs text-slate-400">
                        {policy.carrier} · {displayPolicyNumberWithHash(policy.policyNumber)}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="followup-details" className="label-caps">Details</Label>
            <Textarea
              id="followup-details"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Optional notes for the next touchpoint..."
              rows={4}
              className="resize-none"
            />
          </div>

          <DialogFooter className="-mx-4">
            <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-navy text-white hover:bg-navy/90"
              disabled={saving || !summary.trim()}
            >
              {saving ? "Saving..." : "Save Follow-up"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
