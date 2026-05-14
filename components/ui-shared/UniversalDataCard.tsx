"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface UniversalDataMetric {
  label: ReactNode;
  value: ReactNode;
  helper?: ReactNode;
}

export interface UniversalDataCardProps {
  accentColor?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  href?: string;
  badges?: ReactNode;
  metrics?: UniversalDataMetric[];
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
  metricsClassName?: string;
}

export function UniversalDataCard({
  accentColor = "#CBD5E1",
  title,
  subtitle,
  href,
  badges,
  metrics,
  actions,
  children,
  className,
  contentClassName,
  metricsClassName,
}: UniversalDataCardProps) {
  const content = (
    <div
      className={cn(
        "block border-l-2 p-5 transition-colors",
        href ? "hover:bg-slate-50/80" : "bg-white",
        className
      )}
      style={{ borderLeftColor: accentColor }}
    >
      <div className={cn("min-w-0", contentClassName)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium leading-snug text-triton-text">
              {title}
            </div>
            {subtitle ? (
              <div className="mt-1 text-xs leading-snug text-slate-500">
                {subtitle}
              </div>
            ) : null}
          </div>
          {badges || actions ? (
            <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 sm:justify-end md:max-w-[52%] xl:max-w-[46%]">
              {badges}
              {actions}
            </div>
          ) : null}
        </div>

        {metrics?.length ? (
          <div
            className={cn(
              "mt-4 grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-3",
              metricsClassName
            )}
          >
            {metrics.map((metric, index) => (
              <div key={index} className="space-y-1">
                <p className="label-caps leading-none">
                  {metric.label}
                </p>
                <p className="text-xs font-medium leading-tight text-triton-text">
                  {metric.value}
                </p>
                {metric.helper ? (
                  <p className="text-[9px] leading-none text-triton-muted">
                    {metric.helper}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {children ? <div className="mt-4">{children}</div> : null}
      </div>
    </div>
  );

  if (!href) return content;

  return <Link href={href} className="block">{content}</Link>;
}
