// components/ui-shared/CurrencyInput.tsx
//
// Currency input with thousand-separator formatting.
//
// Behaviour:
//   - While the input is focused → user types raw digits (with optional ".").
//     The visible value still shows commas as they cross thousand boundaries
//     (live formatting), but no auto-blur reformatting happens, so the caret
//     doesn't jump around mid-typing.
//   - On blur → value re-rendered as canonical "1,500,200" / "1,500,200.50".
//   - The numeric value is always exposed via `onValueChange(number | undefined)`,
//     so React Hook Form / parents never see the formatted string.
//
// Why not <input type="number">: HTML number inputs reject "," — you lose the
// ability to display "$1,500,200" as you type. We use type="text" + inputMode
// "decimal" so iOS still gets the numeric keypad.

"use client";

import {
  forwardRef,
  useEffect,
  useState,
  type ChangeEvent,
} from "react";
import { Input } from "@/components/ui/input";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface CurrencyInputProps {
  id?: string;
  /** Numeric value held by the parent / form. */
  value: number | undefined;
  onValueChange: (next: number | undefined) => void;
  placeholder?: string;
  className?: string;
  /** Show a leading "$" inside the input. Default true. */
  showCurrency?: boolean;
  disabled?: boolean;
  /** Allow up to 2 decimals (default true). False = integer-only. */
  allowDecimals?: boolean;
  "aria-invalid"?: boolean;
}

/** Strip every char except digits and one optional decimal point. */
function sanitise(raw: string, allowDecimals: boolean): string {
  if (!raw) return "";
  const cleaned = raw.replace(/[^\d.]/g, "");
  if (!allowDecimals) return cleaned.replace(/\./g, "");
  // collapse multiple dots: keep the first
  const [head, ...rest] = cleaned.split(".");
  return rest.length ? `${head}.${rest.join("").slice(0, 2)}` : head;
}

/** Format the user-typed string by adding thousand separators while leaving
 *  any in-progress decimal portion alone. */
function liveFormat(raw: string): string {
  if (raw === "" || raw === ".") return raw;
  const [intPart, decPart] = raw.split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  function CurrencyInput(
    {
      id,
      value,
      onValueChange,
      placeholder = "0",
      className,
      showCurrency = true,
      disabled,
      allowDecimals = true,
      ...rest
    },
    ref
  ) {
    // Local string state so the user can type intermediate states like "1,"
    // or "1.0" without the parent forcing a re-format on every keystroke.
    const [display, setDisplay] = useState<string>(() =>
      typeof value === "number" ? formatNumber(value) : ""
    );

    // Keep local display in sync when parent value changes externally
    // (e.g. form reset / pre-fill from server data).
    useEffect(() => {
      if (typeof value === "number") {
        // Avoid clobbering an in-progress edit that happens to evaluate to the
        // same number (e.g. user typed "1," → 1).
        const numericFromDisplay = Number(display.replace(/,/g, ""));
        if (numericFromDisplay !== value) {
          setDisplay(formatNumber(value));
        }
      } else if (display !== "") {
        // Parent cleared the value
        if (Number(display.replace(/,/g, "")) !== 0 || display === "") {
          if (display !== "") setDisplay("");
        }
      }
      // We intentionally only react to value changes from the parent, not to
      // every keystroke, hence the bare value in the deps.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    function handleChange(e: ChangeEvent<HTMLInputElement>) {
      const sanitised = sanitise(e.target.value, allowDecimals);
      setDisplay(liveFormat(sanitised));
      const numeric = sanitised === "" || sanitised === "." ? undefined : Number(sanitised);
      onValueChange(Number.isNaN(numeric) ? undefined : numeric);
    }

    function handleBlur() {
      // Re-render canonical form on blur (e.g. "1500" → "1,500").
      if (typeof value === "number" && !Number.isNaN(value)) {
        setDisplay(formatNumber(value));
      }
    }

    return (
      <div className="relative">
        {showCurrency ? (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">
            $
          </span>
        ) : null}
        <Input
          ref={ref}
          id={id}
          type="text"
          inputMode={allowDecimals ? "decimal" : "numeric"}
          autoComplete="off"
          placeholder={placeholder}
          value={display}
          onChange={handleChange}
          onBlur={handleBlur}
          disabled={disabled}
          className={cn(
            showCurrency ? "pl-7" : undefined,
            "font-number",
            className
          )}
          {...rest}
        />
      </div>
    );
  }
);
