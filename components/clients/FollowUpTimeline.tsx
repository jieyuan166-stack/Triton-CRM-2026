// components/clients/FollowUpTimeline.tsx
"use client";

import { useState } from "react";
import {
  Calendar as CalendarIcon,
  ListChecks,
  Mail,
  MessageCircle,
  Phone as PhoneIcon,
  Plus,
  StickyNote,
  Users as UsersIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WidgetCard } from "@/components/ui-shared/WidgetCard";
import { EmptyState } from "@/components/ui-shared/EmptyState";
import { useData } from "@/components/providers/DataProvider";
import { FOLLOW_UP_TYPES, type FollowUp, type FollowUpType } from "@/lib/types";
import { formatDate, todayISO } from "@/lib/date-utils";

const TYPE_ICON: Record<FollowUpType, React.ElementType> = {
  Phone: PhoneIcon,
  Email: Mail,
  Meeting: UsersIcon,
  Note: StickyNote,
  WeChat: MessageCircle,
};

const TYPE_COLOR: Record<FollowUpType, string> = {
  Phone: "bg-accent-blue/15 text-accent-blue",
  Email: "bg-accent-purple/15 text-accent-purple",
  Meeting: "bg-accent-green/15 text-accent-green",
  Note: "bg-slate-100 text-slate-500",
  WeChat: "bg-accent-amber/15 text-amber-600",
};

interface FollowUpTimelineProps {
  clientId: string;
  followUps: FollowUp[];
}

export function FollowUpTimeline({
  clientId,
  followUps,
}: FollowUpTimelineProps) {
  const { createFollowUp } = useData();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FollowUpType>("Phone");
  const [date, setDate] = useState<string>(todayISO());
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");

  function reset() {
    setType("Phone");
    setDate(todayISO());
    setSummary("");
    setDetails("");
    setOpen(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!summary.trim()) return;
    createFollowUp({
      clientId,
      type,
      date,
      summary: summary.trim(),
      details: details.trim() || undefined,
      createdById: "user_admin",
      createdByName: "Admin",
    });
    reset();
  }

  return (
    <WidgetCard
      title="Follow-ups"
      description={`${followUps.length} ${
        followUps.length === 1 ? "entry" : "entries"
      }`}
      action={
        !open ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => setOpen(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        ) : null
      }
    >
      {/* Inline add form */}
      {open ? (
        <form
          onSubmit={handleSubmit}
          className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-5 space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fup-type" className="text-xs">
                Type
              </Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as FollowUpType)}
              >
                <SelectTrigger id="fup-type" className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOLLOW_UP_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fup-date" className="text-xs">
                Date
              </Label>
              <Input
                id="fup-date"
                type="date"
                className="h-9"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fup-summary" className="text-xs">
              Summary <span className="text-accent-red">*</span>
            </Label>
            <Input
              id="fup-summary"
              className="h-9"
              placeholder="e.g. Called to discuss premium top-up"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fup-details" className="text-xs">
              Details
            </Label>
            <Textarea
              id="fup-details"
              rows={3}
              placeholder="Optional notes…"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={reset}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="bg-navy hover:bg-navy/90 text-white"
              disabled={!summary.trim()}
            >
              Save
            </Button>
          </div>
        </form>
      ) : null}

      {/* Timeline */}
      {followUps.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No follow-ups yet"
          description="Track calls, emails, and meetings here."
          compact
        />
      ) : (
        <ul className="space-y-4 relative">
          {/* Vertical line */}
          <span className="absolute left-3.5 top-2 bottom-2 w-px bg-slate-200" />

          {followUps.map((f) => {
            const Icon = TYPE_ICON[f.type];
            return (
              <li key={f.id} className="relative flex gap-4">
                <div
                  className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ring-4 ring-white z-10 ${
                    TYPE_COLOR[f.type]
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0 pb-1">
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <p className="text-sm font-semibold text-triton-text">
                      {f.summary}
                    </p>
                    <span className="inline-flex items-center gap-1 text-[11px] text-triton-muted shrink-0">
                      <CalendarIcon className="h-3 w-3" />
                      {formatDate(f.date)}
                    </span>
                  </div>
                  <p className="text-[11px] text-triton-muted mb-1">
                    {f.type}
                    {f.createdByName ? ` · by ${f.createdByName}` : null}
                  </p>
                  {f.details ? (
                    <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
                      {f.details}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}
