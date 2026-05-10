// components/layout/PageHeader.tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  action,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6 md:mb-8",
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="text-2xl md:text-3xl font-bold text-triton-text leading-tight">
          {title}
        </h1>
        {description ? (
          <p className="text-sm text-triton-muted mt-1">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
