// components/ui-shared/KPICard.tsx
// Big-number widget for the top of the dashboard.
import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

type AccentColor = "blue" | "green" | "amber" | "purple";

const ACCENT_BG: Record<AccentColor, string> = {
  blue: "bg-navy/10 text-navy ring-1 ring-navy/10",
  green: "bg-accent-green/10 text-accent-green ring-1 ring-accent-green/15",
  amber: "bg-accent-amber/12 text-[#8A641E] ring-1 ring-accent-amber/20",
  purple: "bg-accent-purple/10 text-accent-purple ring-1 ring-accent-purple/15",
};

export interface KPICardProps {
  label: string;
  value: string | number;
  /** Optional secondary line under the value (e.g. "across 24 clients") */
  subValue?: string;
  /** Percentage change vs prior period; positive = up, negative = down */
  deltaPercent?: number;
  /** Label for the comparison period, e.g. "vs last month" */
  deltaLabel?: string;
  icon?: LucideIcon;
  accent?: AccentColor;
  className?: string;
}

export function KPICard({
  label,
  value,
  subValue,
  deltaPercent,
  deltaLabel,
  icon: Icon,
  accent = "blue",
  className,
}: KPICardProps) {
  const hasDelta = typeof deltaPercent === "number";
  const positive = hasDelta && deltaPercent! >= 0;

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border border-[#E8DCC4]/85 bg-card p-3.5 shadow-[0_14px_36px_-30px_rgba(7,27,51,0.5)] sm:p-5 md:gap-3 md:p-6",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2 md:gap-3">
        <span className="text-[10px] font-semibold uppercase leading-tight tracking-[0.14em] text-slate-500 sm:text-xs">
          {label}
        </span>
        {Icon ? (
          <div
            className={cn(
              "h-7 w-7 sm:h-9 sm:w-9 rounded-lg flex items-center justify-center shrink-0",
              ACCENT_BG[accent]
            )}
          >
            <Icon className="h-3.5 w-3.5 sm:h-4.5 sm:w-4.5" strokeWidth={2} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-finance text-2xl sm:text-3xl font-semibold text-triton-text leading-none tracking-tight">
          {value}
        </span>
        {subValue ? (
          <span className="font-finance text-[10px] sm:text-xs leading-snug text-triton-muted">
            {subValue}
          </span>
        ) : null}
      </div>

      {hasDelta ? (
        <div className="flex items-center gap-1.5 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-semibold font-number",
              positive ? "text-accent-green" : "text-accent-red"
            )}
          >
            {positive ? (
              <ArrowUp className="h-3 w-3" />
            ) : (
              <ArrowDown className="h-3 w-3" />
            )}
            {Math.abs(deltaPercent!).toFixed(1)}%
          </span>
          {deltaLabel ? (
            <span className="text-triton-muted">{deltaLabel}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
