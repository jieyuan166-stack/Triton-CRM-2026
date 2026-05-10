// components/ui-shared/EmptyState.tsx
// Friendly placeholder used when a list has no items.
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Action node, typically a Button */
  action?: ReactNode;
  className?: string;
  /** Compact variant — smaller padding & icon for inline use inside cards */
  compact?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-8 px-4 gap-2" : "py-14 px-6 gap-3",
        className
      )}
    >
      <div
        className={cn(
          "rounded-full bg-slate-100 flex items-center justify-center",
          compact ? "h-10 w-10" : "h-14 w-14"
        )}
      >
        <Icon
          className={cn("text-slate-400", compact ? "h-5 w-5" : "h-6 w-6")}
          strokeWidth={1.75}
        />
      </div>
      <h4
        className={cn(
          "font-semibold text-triton-text",
          compact ? "text-sm" : "text-base"
        )}
      >
        {title}
      </h4>
      {description ? (
        <p
          className={cn(
            "text-triton-muted max-w-xs",
            compact ? "text-xs" : "text-sm"
          )}
        >
          {description}
        </p>
      ) : null}
      {action ? <div className={compact ? "mt-1" : "mt-2"}>{action}</div> : null}
    </div>
  );
}
