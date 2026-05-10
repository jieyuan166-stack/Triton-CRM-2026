// components/ui-shared/MonthDayPicker.tsx
//
// Yearless month/day picker. Two side-by-side Selects (Month + Day).
// The year never appears anywhere — neither in the trigger UI, the
// dropdown options, nor the value passed to consumers.
//
// Value contract: `"MM-DD"` (e.g. `"10-24"`) or `undefined`.
// This is the canonical storage format for Policy.premiumDate going forward.
"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const MONTHS: { value: string; label: string }[] = [
  { value: "01", label: "Jan" },
  { value: "02", label: "Feb" },
  { value: "03", label: "Mar" },
  { value: "04", label: "Apr" },
  { value: "05", label: "May" },
  { value: "06", label: "Jun" },
  { value: "07", label: "Jul" },
  { value: "08", label: "Aug" },
  { value: "09", label: "Sep" },
  { value: "10", label: "Oct" },
  { value: "11", label: "Nov" },
  { value: "12", label: "Dec" },
];

/** Max valid day per month — Feb 29 is allowed since this is a recurring
 *  date with no fixed year. */
const DAYS_IN_MONTH: Record<string, number> = {
  "01": 31, "02": 29, "03": 31, "04": 30,
  "05": 31, "06": 30, "07": 31, "08": 31,
  "09": 30, "10": 31, "11": 30, "12": 31,
};

export interface MonthDayPickerProps {
  id?: string;
  /** "MM-DD" or undefined. */
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
}

/** Convert any tolerable input ("MM-DD", "YYYY-MM-DD") to ["MM","DD"] strings,
 *  or [undefined, undefined] for empty/garbage. */
function splitMMDD(value: string | undefined): [string | undefined, string | undefined] {
  if (!value) return [undefined, undefined];
  const mmdd = /^(\d{2})-(\d{2})$/.exec(value);
  if (mmdd) return [mmdd[1], mmdd[2]];
  const iso = /^\d{4}-(\d{2})-(\d{2})/.exec(value);
  if (iso) return [iso[1], iso[2]];
  return [undefined, undefined];
}

export function MonthDayPicker({
  id,
  value,
  onChange,
  disabled,
  className,
}: MonthDayPickerProps) {
  const [mm, dd] = splitMMDD(value);

  function emit(nextMm: string | undefined, nextDd: string | undefined) {
    if (nextMm && nextDd) onChange(`${nextMm}-${nextDd}`);
    else onChange(undefined);
  }

  function handleMonthChange(next: string | null) {
    const m = next ?? undefined;
    if (!m) {
      emit(undefined, dd);
      return;
    }
    // If the existing day overflows the new month, clamp to that month's max.
    const maxDay = DAYS_IN_MONTH[m] ?? 31;
    let d = dd;
    if (d && Number(d) > maxDay) {
      d = String(maxDay).padStart(2, "0");
    }
    emit(m, d);
  }

  function handleDayChange(next: string | null) {
    emit(mm, next ?? undefined);
  }

  const dayOptions = (() => {
    const max = mm ? DAYS_IN_MONTH[mm] ?? 31 : 31;
    return Array.from({ length: max }, (_, i) =>
      String(i + 1).padStart(2, "0")
    );
  })();

  return (
    <div
      id={id}
      className={cn("grid grid-cols-2 gap-2", className)}
      role="group"
      aria-label="Month and Day"
    >
      <Select
        value={mm ?? ""}
        onValueChange={(v) => handleMonthChange(v)}
        disabled={disabled}
      >
        <SelectTrigger className="w-full" aria-label="Month">
          <SelectValue placeholder="Month" />
        </SelectTrigger>
        <SelectContent>
          {MONTHS.map((m) => (
            <SelectItem key={m.value} value={m.value}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={dd ?? ""}
        onValueChange={(v) => handleDayChange(v)}
        disabled={disabled || !mm}
      >
        <SelectTrigger className="w-full" aria-label="Day">
          <SelectValue placeholder={mm ? "Day" : "—"} />
        </SelectTrigger>
        <SelectContent>
          {dayOptions.map((d) => (
            <SelectItem key={d} value={d}>
              {d}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
