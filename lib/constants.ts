// lib/constants.ts
// SHARED ENUMS — single source of truth for fixed business vocabularies.
// Do NOT inline these strings anywhere else. Import from this module.
//
// These constants are mirrored in:
//   - app-level Zod schemas (lib/validators.ts) for both client + server validation
//   - the API route handlers (app/api/clients/...)
//   - the future Prisma schema (Step 10) — same string values are persisted
//     so a JSON array column is enforceable from end to end without remapping.

// === Province ===
export const PROVINCE_CODES = ["BC", "AB", "ON"] as const;
export type ProvinceCode = (typeof PROVINCE_CODES)[number];

export const PROVINCE_LABELS: Record<ProvinceCode, string> = {
  BC: "British Columbia",
  AB: "Alberta",
  ON: "Ontario",
};

export function isProvinceCode(v: unknown): v is ProvinceCode {
  return typeof v === "string" && (PROVINCE_CODES as readonly string[]).includes(v);
}

// === Tags ===
// All Client tags are now COMPUTED from the client + their policies — see
// lib/client-tags.ts:calculateClientTags. The values below are used as
// canonical identifiers in URL params, filter dropdowns, and badge styling.
export const TAG_VALUES = [
  "insurance",
  "investment",
  "VIP",
  "Loan",
  "Corporate",
  "Missing Information",
] as const;
export type TagValue = (typeof TAG_VALUES)[number];

export const TAG_LABELS: Record<TagValue, string> = {
  insurance: "Insurance",
  investment: "Investment",
  VIP: "VIP",
  Loan: "Loan",
  Corporate: "Corporate",
  "Missing Information": "Missing Information",
};

export function isTagValue(v: unknown): v is TagValue {
  return typeof v === "string" && (TAG_VALUES as readonly string[]).includes(v);
}

// === Relationship (client-to-client linking) ===
// Distinct from policy beneficiary relationships (lib/types.ts:RELATIONSHIPS).
// This vocabulary describes how two clients are connected in our book — used
// by the `linkedToId` + `relationship` fields on Client.
export const RELATIONSHIP_TYPES = [
  "Spouse",
  "Child",
  "Parent",
  "Beneficiary",
  "Sibling",
  "Trustee",
  "Business Associate",
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export function isRelationshipType(v: unknown): v is RelationshipType {
  return (
    typeof v === "string" &&
    (RELATIONSHIP_TYPES as readonly string[]).includes(v)
  );
}

// === Canadian postal code regex ===
// Format: A1A 1A1 or A1A1A1. First letter cannot be D/F/I/O/Q/U/W/Z per
// Canada Post, but the relaxed form below is accepted by most CRMs.
export const CANADIAN_POSTAL_CODE_REGEX = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;

/** Normalise to uppercase with a single space — "v6b1a1" → "V6B 1A1". */
export function formatPostalCode(raw: string): string {
  const cleaned = raw.replace(/[\s-]/g, "").toUpperCase();
  if (cleaned.length <= 3) return cleaned;
  return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)}`;
}
