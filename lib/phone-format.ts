// lib/phone-format.ts — Canadian/US phone mask "(XXX) XXX-XXXX".
//
// We format the displayed value progressively as the user types, but only
// store the formatted string (or strip back to digits at submit time, your
// choice). The 10-digit cap matches NANP — if international numbers become
// a requirement, drop the slice + reformat as E.164.

export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function isCompletePhone(formatted: string): boolean {
  return formatted.replace(/\D/g, "").length === 10;
}
