// components/ui-shared/DynamicTagBadge.tsx
"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  Building2,
  CircleAlert,
  Shield,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TAG_LABELS, type TagValue } from "@/lib/constants";
import { cn } from "@/lib/utils";

const STYLES: Record<
  TagValue,
  { icon: LucideIcon; className: string }
> = {
  insurance: {
    icon: Shield,
    className: "bg-sky-50 text-sky-700 ring-sky-200/70",
  },
  investment: {
    icon: TrendingUp,
    className: "bg-violet-50 text-violet-700 ring-violet-200/70",
  },
  VIP: {
    icon: Sparkles,
    className:
      "bg-gradient-to-r from-amber-100 to-amber-50 text-amber-800 ring-amber-300/70",
  },
  Loan: {
    icon: Banknote,
    className: "bg-indigo-50 text-indigo-700 ring-indigo-200/70",
  },
  Corporate: {
    icon: Building2,
    className: "bg-slate-100 text-slate-700 ring-slate-300/70",
  },
  "Missing Information": {
    icon: CircleAlert,
    className: "bg-rose-50 text-rose-700 ring-rose-200/70",
  },
};

export function DynamicTagBadge({
  tag,
  className,
  details,
  detailsTitle,
}: {
  tag: TagValue;
  className?: string;
  details?: string[];
  detailsTitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const { icon: Icon, className: tagClass } = STYLES[tag];
  const hasDetails = !!details?.length;
  const content = (
    <>
      <Icon className="h-2.5 w-2.5" strokeWidth={2.5} />
      {TAG_LABELS[tag]}
    </>
  );

  if (!hasDetails) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1",
          tagClass,
          className
        )}
      >
        {content}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300",
          tagClass,
          className
        )}
      >
        {content}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {detailsTitle ?? `${TAG_LABELS[tag]} details`}
            </DialogTitle>
          </DialogHeader>
          <ul className="space-y-2 text-sm text-slate-600">
            {details.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
