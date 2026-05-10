// components/ui-shared/KPICard.tsx
// Big-number widget for the top of the dashboard.
import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

type AccentColor = "blue" | "green" | "amber" | "purple";

const ACCENT_BG: Record<AccentColor, string> = {
  blue: "bg-accent-blue/10 text-accent-blue",
  green: "bg-accent-green/10 text-accent-green",
  amber: "bg-accent-amber/10 text-accent-amber",
  purple: "bg-accent-purple/10 text-accent-purple",
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
        "bg-card rounded-xl border border-slate-200 shadow-sm p-5 md:p-6 flex flex-col gap-3",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </span>
        {Icon ? (
          <div
            className={cn(
              "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
              ACCENT_BG[accent]
            )}
          >
            <Icon className="h-4.5 w-4.5" strokeWidth={2} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-3xl md:text-4xl font-bold text-triton-text tabular-nums leading-none">
          {value}
        </span>
        {subValue ? (
          <span className="text-xs text-triton-muted">{subValue}</span>
        ) : null}
      </div>

      {hasDelta ? (
        <div className="flex items-center gap-1.5 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-semibold tabular-nums",
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
