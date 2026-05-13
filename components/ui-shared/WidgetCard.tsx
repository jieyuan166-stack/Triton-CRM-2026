// components/ui-shared/WidgetCard.tsx
// Generic dashboard widget container with title, optional action, body slot.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface WidgetCardProps {
  title: string;
  description?: string;
  /** Right-aligned action node, e.g. a Button or Link */
  action?: ReactNode;
  /** Optional inline icon on the left of the title */
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Remove default padding on the body — use when content needs edge-to-edge (tables) */
  bodyFlush?: boolean;
}

export function WidgetCard({
  title,
  description,
  action,
  icon,
  children,
  className,
  bodyFlush = false,
}: WidgetCardProps) {
  return (
    <div
      className={cn(
        "bg-card rounded-xl border border-slate-200 shadow-sm flex flex-col",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-5 md:px-6 pt-5 pb-5">
        <div className="flex items-center gap-2.5 min-w-0">
          {icon ? <span className="shrink-0">{icon}</span> : null}
          <div className="min-w-0">
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-700">
              {title}
            </h3>
            {description ? (
              <p className="text-xs text-triton-muted mt-0.5 truncate">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      {/* Body */}
      <div className={cn("flex-1", bodyFlush ? "" : "px-5 md:px-6 pb-5 md:pb-6")}>
        {children}
      </div>
    </div>
  );
}
