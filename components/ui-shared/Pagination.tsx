// components/ui-shared/Pagination.tsx
// Generic pagination: range readout + rows-per-page selector + page nav.
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface PaginationProps {
  page: number;          // 1-indexed
  perPage: number;
  total: number;
  totalPages: number;
  perPageOptions?: number[];
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number) => void;
  className?: string;
}

/** Build a page list with ellipses, capped to ~7 visible buttons. */
function buildPageList(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const list: (number | "…")[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) list.push("…");
  for (let i = left; i <= right; i++) list.push(i);
  if (right < total - 1) list.push("…");
  list.push(total);
  return list;
}

export function Pagination({
  page,
  perPage,
  total,
  totalPages,
  perPageOptions = [25, 50, 100],
  onPageChange,
  onPerPageChange,
  className,
}: PaginationProps) {
  const start = total === 0 ? 0 : (page - 1) * perPage + 1;
  const end = Math.min(total, page * perPage);
  const pages = buildPageList(page, totalPages);

  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 md:px-6 py-3 border-t border-slate-100 bg-slate-50/50",
        className
      )}
    >
      {/* Range + per-page */}
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span className="font-number">
          Showing{" "}
          <span className="font-medium text-slate-700">{start}</span>–
          <span className="font-medium text-slate-700">{end}</span> of{" "}
          <span className="font-medium text-slate-700">{total}</span>
        </span>
        <Select
          value={String(perPage)}
          onValueChange={(v) => v && onPerPageChange(Number(v))}
        >
          <SelectTrigger className="h-7 w-auto px-2 gap-1 text-xs bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {perPageOptions.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} rows
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Page navigation */}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          className="h-7 w-7"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>

        {pages.map((p, i) =>
          p === "…" ? (
            <span
              key={`ellipsis-${i}`}
              className="px-1.5 text-xs text-slate-400"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              aria-current={p === page ? "page" : undefined}
              className={cn(
                "h-7 min-w-7 px-2 rounded-md text-xs font-medium font-number transition-colors",
                p === page
                  ? "bg-navy text-white"
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              {p}
            </button>
          )
        )}

        <Button
          variant="outline"
          size="icon-sm"
          className="h-7 w-7"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
