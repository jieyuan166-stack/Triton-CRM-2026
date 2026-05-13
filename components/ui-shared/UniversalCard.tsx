"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface UniversalCardProps {
  children: ReactNode;
  className?: string;
}

export function UniversalCard({ children, className }: UniversalCardProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]",
        className
      )}
    >
      {children}
    </section>
  );
}
