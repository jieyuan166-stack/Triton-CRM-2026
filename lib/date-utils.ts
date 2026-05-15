// lib/date-utils.ts — domain date helpers
import type { PaymentFrequency } from "./types";

const FREQ_MONTHS: Record<PaymentFrequency, number> = {
  Monthly: 1,
  Quarterly: 3,
  "Semi-Annual": 6,
  Annual: 12,
};

/** Parse date-only values without timezone drift.
 *
 * Native `new Date("2018-02-05")` treats the string as UTC. In Vancouver that
 * renders as Feb 4, which is wrong for CRM/business dates entered by humans.
 * For plain `YYYY-MM-DD` values, construct the Date with local calendar parts.
 * Timestamp values with time components still go through the native parser.
 */
export function parseCalendarDate(input: string): Date {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (dateOnly) {
    return new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3])
    );
  }
  return new Date(input);
}

/**
 * Calculate the next premium due date by walking forward in `frequency` steps
 * from `effectiveDate` until the date is strictly after `today`.
 * If today is before the effective date, the effective date itself is returned.
 */
export function calcNextPremiumDate(
  effectiveDate: string,
  frequency: PaymentFrequency,
  today: Date = new Date()
): string {
  const start = parseCalendarDate(effectiveDate);
  if (today < start) return effectiveDate;

  const monthsStep = FREQ_MONTHS[frequency];
  const next = new Date(start);
  while (next <= today) {
    next.setMonth(next.getMonth() + monthsStep);
  }
  return [
    next.getFullYear(),
    String(next.getMonth() + 1).padStart(2, "0"),
    String(next.getDate()).padStart(2, "0"),
  ].join("-");
}

/** Parse either an ISO date ("YYYY-MM-DD"...) or a yearless "MM-DD" string
 *  into month/day numbers. Returns null bits if the input is unparseable. */
function parseDateLike(input: string): { mm: number; dd: number } | null {
  const mmdd = /^(\d{2})-(\d{2})$/.exec(input);
  if (mmdd) return { mm: Number(mmdd[1]), dd: Number(mmdd[2]) };
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
  if (iso) return { mm: Number(iso[2]), dd: Number(iso[3]) };
  return null;
}

/** Days between today and the given date.
 *  - ISO dates: concrete days (negative = past).
 *  - "MM-DD" strings: days until next anniversary (always >= 0). */
export function daysUntil(input: string, today: Date = new Date()): number {
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  const parts = parseDateLike(input);
  if (!parts) return Number.NaN;

  const isAnniversary = /^\d{2}-\d{2}$/.test(input);
  if (isAnniversary) {
    let next = new Date(today.getFullYear(), parts.mm - 1, parts.dd);
    if (next < todayStart) {
      next = new Date(today.getFullYear() + 1, parts.mm - 1, parts.dd);
    }
    return Math.round(
      (next.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  const target = parseCalendarDate(input);
  const targetStart = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate()
  );
  return Math.round(
    (targetStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24)
  );
}

/** Format an ISO date as e.g. "May 6, 2026". Locale-aware via Intl. */
export function formatDate(isoDate: string, locale = "en-CA"): string {
  return parseCalendarDate(isoDate).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Compact month + zero-padded day, e.g. "May 07" — used for Premium Date.
 *  Accepts either a full ISO date or a "MM-DD" yearless string.
 *  Year is intentionally never rendered: premium dates roll forward
 *  continuously and the year is implied by context. */
export function formatMonthDay(input: string, locale = "en-CA"): string {
  const parts = parseDateLike(input);
  if (!parts) return "—";
  // Use any neutral year — only month/day cross the formatter.
  return new Date(2000, parts.mm - 1, parts.dd).toLocaleDateString(locale, {
    month: "short",
    day: "2-digit",
  });
}

/** Resolve a recurring MM-DD date to the next concrete calendar date.
 *  Example in 2026: "06-10" -> "2026-06-10"; "01-10" -> "2027-01-10".
 *  Full ISO dates pass through as their YYYY-MM-DD date portion. */
export function resolveRecurringDate(
  input: string,
  today: Date = new Date()
): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const parts = parseDateLike(input);
  if (!parts) return input;

  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  let target = new Date(today.getFullYear(), parts.mm - 1, parts.dd);
  if (target < todayStart) {
    target = new Date(today.getFullYear() + 1, parts.mm - 1, parts.dd);
  }
  return [
    target.getFullYear(),
    String(target.getMonth() + 1).padStart(2, "0"),
    String(target.getDate()).padStart(2, "0"),
  ].join("-");
}

/** Format an ISO date as relative ("Today", "in 3 days", "5 days ago"). */
export function formatRelative(isoDate: string, today: Date = new Date()): string {
  const days = daysUntil(isoDate, today);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 0) return `in ${days} days`;
  return `${Math.abs(days)} days ago`;
}

/** Age in years from a birthday ISO string. */
export function calcAge(birthday: string, today: Date = new Date()): number {
  const b = parseCalendarDate(birthday);
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
}

/** Today as ISO YYYY-MM-DD. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
