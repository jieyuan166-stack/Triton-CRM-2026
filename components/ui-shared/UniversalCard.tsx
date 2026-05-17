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
        "rounded-2xl border border-[#E8DCC4]/80 bg-card p-5 shadow-[0_18px_45px_-34px_rgba(7,27,51,0.5)]",
        className
      )}
    >
      {children}
    </section>
  );
}
