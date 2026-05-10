// lib/format.ts
// Single source of truth for monetary formatting across the CRM.
// Built on Intl.NumberFormat — locale + currency switch happens here only.

const FORMATTER_FULL = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const FORMATTER_FULL_CENTS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const FORMATTER_COMPACT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

/**
 * Full currency, e.g. `1500200 → "$1,500,200"`.
 * Use everywhere we have the room for full precision (table cells, detail
 * cards, form previews, email bodies).
 */
export function formatCurrency(
  amount: number | null | undefined,
  opts: { showCents?: boolean } = {}
): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  return (opts.showCents ? FORMATTER_FULL_CENTS : FORMATTER_FULL).format(amount);
}

/**
 * Compact currency, e.g. `1500200 → "$1.5M"`.
 * Use only in tight dashboard cards / sidebars where horizontal space is
 * scarce.
 */
export function formatCurrencyCompact(
  amount: number | null | undefined
): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  return FORMATTER_COMPACT.format(amount);
}

/**
 * Plain integer with thousand separators (no $ sign). Useful inside text
 * input on blur, where the leading $ is rendered as a sibling element.
 */
export function formatNumber(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(amount);
}
