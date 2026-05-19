"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
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
import {
  FOLLOW_UP_IMPORTANCE,
  FOLLOW_UP_TYPES,
  type FollowUp,
  type FollowUpImportance,
  type FollowUpType,
} from "@/lib/types";

interface FollowUpEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  onSave: (input: Omit<FollowUp, "id" | "createdAt">) => FollowUp | null | undefined;
}

const NO_IMPORTANCE = "__none__";

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export function FollowUpEntryDialog({
  open,
  onOpenChange,
  clientId,
  onSave,
}: FollowUpEntryDialogProps) {
  const { session } = useAuth();
  const [type, setType] = useState<FollowUpType>("Phone");
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [deadline, setDeadline] = useState("");
  const [importance, setImportance] = useState<FollowUpImportance | "">("");

  useEffect(() => {
    if (!open) return;
    setType("Phone");
    setSummary("");
    setDetails("");
    setDeadline("");
    setImportance("");
  }, [open]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const cleanSummary = summary.trim();
    if (!cleanSummary) return;

    const saved = onSave({
      clientId,
      type,
      date: todayDate(),
      summary: cleanSummary,
      details: details.trim() || undefined,
      deadline: deadline || undefined,
      importance: importance || undefined,
      createdById: session?.user?.id ?? "user",
      createdByName:
        session?.user?.name ?? session?.user?.email ?? "Advisor",
    });
    if (saved === null) return;
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
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
              onChange={(event) => setDeadline(event.target.value)}
            />
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
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-navy text-white hover:bg-navy/90"
              disabled={!summary.trim()}
            >
              Save Follow-up
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
