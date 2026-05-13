// lib/format.ts
// Single source of truth for monetary formatting across the CRM.
// Built on Intl.NumberFormat — locale + currency switch happens here only.

const FORMATTER_FULL_CENTS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function truncateToCents(amount: number): number {
  return Math.trunc(amount * 100) / 100;
}

/**
 * Full currency, e.g. `1500200 → "$1,500,200.00"`.
 * Amounts are truncated to cents, never rounded.
 * Use everywhere we have the room for full precision (table cells, detail
 * cards, form previews, email bodies).
 */
export function formatCurrency(
  amount: number | null | undefined,
  opts: { showCents?: boolean } = {}
): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  const normalized = truncateToCents(amount);
  if (opts.showCents === false) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.trunc(normalized));
  }
  return FORMATTER_FULL_CENTS.format(normalized);
}

/**
 * Kept for existing call sites, but no longer uses compact notation: money in
 * Triton CRM should display full values instead of rounded approximations.
 */
export function formatCurrencyCompact(
  amount: number | null | undefined
): string {
  return formatCurrency(amount);
}

/**
 * Plain integer with thousand separators (no $ sign). Useful inside text
 * input on blur, where the leading $ is rendered as a sibling element.
 */
export function formatNumber(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(truncateToCents(amount));
}
