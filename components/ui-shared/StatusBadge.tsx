"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusBadgeKind = "insurance" | "investment" | "corporate" | "loan" | "joint" | "custom";

export interface StatusBadgeProps {
  kind: StatusBadgeKind;
  label?: string;
  lender?: string | null;
  className?: string;
}

const BASE_BADGE_CLASS =
  "h-auto min-h-5 overflow-visible whitespace-normal border-0 px-2 py-0.5 text-left text-[10px] font-semibold leading-none tracking-wider ring-1 rounded-md";

function displayLenderName(lender?: string | null) {
  const value = (lender ?? "").trim();
  const normalized = value.toLowerCase();

  if (normalized === "b2b bank") return "B2B Bank";
  if (normalized === "ia loan") return "iA Loan";
  return value;
}

function lenderTone(lender?: string | null) {
  const normalized = (lender ?? "").trim().toLowerCase();

  if (normalized === "manulife bank") return "bg-emerald-100 text-emerald-700 ring-emerald-200";
  if (normalized === "b2b bank") return "bg-[#F4E7C8] text-[#8A641E] ring-[#E0C68F]";
  if (normalized === "ia loan") return "bg-blue-100 text-blue-700 ring-blue-200";
  if (normalized === "national bank") return "bg-red-50 text-red-600 ring-red-100";
  return "bg-emerald-50 text-emerald-700 ring-emerald-100";
}

function badgeTone(kind: StatusBadgeKind, lender?: string | null) {
  if (kind === "loan") return lenderTone(lender);
  if (kind === "investment") return "bg-[#F7EDDA] text-[#8A641E] ring-[#E6D1A6]";
  if (kind === "insurance") return "bg-[#EEF4FA] text-[#0B3A64] ring-[#C8D8E8]";
  if (kind === "corporate") return "bg-[#F3EADC] text-slate-600 ring-[#E1D1B6]";
  if (kind === "joint") return "bg-purple-50 text-purple-600 ring-purple-100";
  return "bg-[#F8F1E6] text-slate-600 ring-[#E8DCC4]";
}

export function StatusBadge({ kind, label, lender, className }: StatusBadgeProps) {
  const lenderName = displayLenderName(lender);
  const text =
    label ??
    (kind === "loan"
      ? lenderName
        ? `LOAN · ${lenderName}`
        : "LOAN"
      : kind.toUpperCase());

  return (
    <Badge className={cn(BASE_BADGE_CLASS, badgeTone(kind, lender), className)}>
      {text}
    </Badge>
  );
}

export { displayLenderName, lenderTone };
