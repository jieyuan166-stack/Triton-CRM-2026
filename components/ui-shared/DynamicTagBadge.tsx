// components/ui-shared/DynamicTagBadge.tsx
import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  Building2,
  Shield,
  Sparkles,
  TrendingUp,
} from "lucide-react";
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
};

export function DynamicTagBadge({
  tag,
  className,
}: {
  tag: TagValue;
  className?: string;
}) {
  const { icon: Icon, className: tagClass } = STYLES[tag];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1",
        tagClass,
        className
      )}
    >
      <Icon className="h-2.5 w-2.5" strokeWidth={2.5} />
      {TAG_LABELS[tag]}
    </span>
  );
}
