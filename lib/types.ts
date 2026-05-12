// lib/types.ts — single source of truth for domain types
// Mirrors Prisma schema in §5.2 (Step 10) so the mock layer can swap to real DB seamlessly.

export type Carrier =
  | "Canada Life"
  | "Manulife"
  | "Sun Life"
  | "iA"
  | "Equitable Life";

export const CARRIERS: Carrier[] = [
  "Canada Life",
  "Manulife",
  "Sun Life",
  "iA",
  "Equitable Life",
];

export type PolicyCategory = "Insurance" | "Investment";

export type ProductType =
  // Insurance
  | "Whole Life"
  | "Term Insurance"
  | "Critical Illness"
  // Investment
  | "TFSA"
  | "RRSP"
  | "RESP"
  | "FHSA"
  | "Non-Registered"
  // Legacy values kept so historical Policy records still typecheck —
  // the "New Policy" form no longer offers these.
  | "Segregated Fund"
  | "Medical"
  | "Life"
  | "Annuity"
  | "Disability";

export const INSURANCE_PRODUCTS: ProductType[] = [
  "Whole Life",
  "Term Insurance",
  "Critical Illness",
];

export const INVESTMENT_PRODUCTS: ProductType[] = [
  "TFSA",
  "RRSP",
  "RESP",
  "FHSA",
  "Non-Registered",
];

// === Investment lenders ===
// Selectable when an Investment policy is funded by a loan.
export const LENDERS = [
  "Manulife Bank",
  "B2B bank",
  "iA loan",
  "National Bank",
] as const;
export type Lender = (typeof LENDERS)[number];

export type PaymentFrequency =
  | "Monthly"
  | "Quarterly"
  | "Semi-Annual"
  | "Annual";

/** Form-visible payment frequencies. Quarterly/Semi-Annual remain in the
 *  type union for legacy records but are no longer offered for new policies. */
export const PAYMENT_FREQUENCIES: PaymentFrequency[] = ["Monthly", "Annual"];

/** Display label for a payment frequency. */
export const PAYMENT_FREQUENCY_LABELS: Record<PaymentFrequency, string> = {
  Monthly: "Monthly",
  Quarterly: "Quarterly",
  "Semi-Annual": "Semi-Annual",
  Annual: "Yearly",
};

export type PolicyStatus = "active" | "lapsed" | "pending";

export type RelationshipType =
  | "Spouse"
  | "Child"
  | "Parent"
  | "Sibling"
  | "Other";

export const RELATIONSHIPS: RelationshipType[] = [
  "Spouse",
  "Child",
  "Parent",
  "Sibling",
  "Other",
];

export type FollowUpType = "Phone" | "Email" | "Meeting" | "Note" | "WeChat";

export const FOLLOW_UP_TYPES: FollowUpType[] = [
  "Phone",
  "Email",
  "Meeting",
  "Note",
  "WeChat",
];

export type UserRole = "admin" | "advisor" | "viewer";

// === Entities ===

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

// Re-exports so existing imports of these from lib/types keep working.
// New code should import directly from lib/constants.
//
// `RelationshipType` from constants is the *client-to-client* relationship
// vocabulary; the local `RelationshipType` (defined below) is the *policy
// beneficiary* vocabulary. We alias the import to keep both available.
import type {
  ProvinceCode,
  RelationshipType as ClientLinkRelationship,
  TagValue,
} from "./constants";

/** A single past email send to this client. The Client.emailHistory list
 *  is the canonical source for the per-client Communication Log on
 *  /clients/[id]; entries are appended only after the SMTP send returns ok.
 *
 *  The `body` is preserved verbatim for audit / future export, but the UI
 *  list deliberately renders only the timestamp + a one-line action label
 *  (see CommunicationLog) — keep the data, hide the noise. */
export interface EmailHistoryEntry {
  id: string;
  /** ISO timestamp of when the send succeeded. */
  date: string;
  subject: string;
  body: string;
  /** Human-readable action label for the log row, e.g. "Renewal Reminder",
   *  "Birthday Greeting", or "Custom". Optional for back-compat with
   *  entries written before this field existed — CommunicationLog falls
   *  back to "Email" when absent. */
  templateLabel?: string;
}

export interface Client {
  id: string;
  firstName: string;
  lastName: string;
  /** Required + unique. Enforced by Zod (client) and DB unique index (server). */
  email: string;
  phone?: string;

  /** Split address — see brief. The single-line `address` field has been removed. */
  streetAddress?: string;
  unit?: string;
  city?: string;
  province?: ProvinceCode;
  postalCode?: string;

  birthday?: string;           // ISO date YYYY-MM-DD
  notes?: string;

  /** Self-referencing client link — see brief §2 "客户关系网". */
  linkedToId?: string;
  relationship?: ClientLinkRelationship;

  /** Append-only log of emails the advisor has sent. Surfaced as the
   *  Communication Log on the client detail page. */
  emailHistory?: EmailHistoryEntry[];

  /** Advisor-controlled tag overrides. `manualTags` adds tags that are not
   *  currently produced by the dynamic rules; `hiddenTags` hides dynamic tags
   *  the advisor has intentionally removed from this client. */
  manualTags?: TagValue[];
  hiddenTags?: TagValue[];

  /** ISO timestamp of the last birthday email sent to this client. The
   *  Upcoming Birthdays widget uses this to suppress rows that have
   *  already been contacted within the suppression window so the dashboard
   *  shrinks in real time after a successful send. */
  lastBirthdayEmailAt?: string;

  /** ISO timestamp of the most recent successful email of any kind —
   *  renewal, birthday, or custom one-off. This is a general "I've talked
   *  to this client recently" signal; the per-template stamps above are
   *  for dashboard suppression. */
  lastContactedAt?: string;

  createdAt: string;
}

export interface ClientRelationship {
  id: string;
  fromClientId: string;
  toClientId: string;
  relationship: ClientLinkRelationship;
  createdAt: string;
}

/** All Canadian provinces & territories — kept for label lookup. */
export const PROVINCES: { code: string; label: string }[] = [
  { code: "AB", label: "Alberta" },
  { code: "BC", label: "British Columbia" },
  { code: "MB", label: "Manitoba" },
  { code: "NB", label: "New Brunswick" },
  { code: "NL", label: "Newfoundland and Labrador" },
  { code: "NS", label: "Nova Scotia" },
  { code: "NT", label: "Northwest Territories" },
  { code: "NU", label: "Nunavut" },
  { code: "ON", label: "Ontario" },
  { code: "PE", label: "Prince Edward Island" },
  { code: "QC", label: "Quebec" },
  { code: "SK", label: "Saskatchewan" },
  { code: "YT", label: "Yukon" },
];

/**
 * @deprecated Import `PROVINCE_CODES` from `lib/constants` instead.
 * Kept as a value alias so older call sites keep compiling.
 */
export { PROVINCE_CODES as SELECTABLE_PROVINCES } from "./constants";

export function provinceLabel(code?: string): string {
  if (!code) return "—";
  return PROVINCES.find((p) => p.code === code)?.label ?? code;
}

export interface Beneficiary {
  id: string;
  policyId: string;
  name: string;
  relationship: RelationshipType;
  sharePercent: number;  // 1–100, sum across a policy must equal 100
}

export interface Policy {
  id: string;
  clientId: string;
  carrier: Carrier;
  category: PolicyCategory;
  productType: ProductType;
  productName: string;
  policyNumber: string;
  sumAssured: number;
  premium: number;
  paymentFrequency: PaymentFrequency;
  paymentTermYears?: number;   // undefined = whole life
  effectiveDate: string;       // ISO date
  premiumDate?: string;        // next premium due (auto-calculated)
  maturityDate?: string;
  status: PolicyStatus;

  // Corporate-insurance fields. Only meaningful when category === "Insurance".
  isCorporateInsurance?: boolean;
  businessName?: string;

  // Investment-loan fields. Only meaningful when category === "Investment".
  isInvestmentLoan?: boolean;
  lender?: Lender;
  loanAmount?: number;
  /** @deprecated Loan Rate dropped from the form; field kept for legacy data. */
  loanRate?: number;

  /** ISO timestamp of the last renewal-reminder email sent for this
   *  policy. Drives the suppression filter on the Upcoming Premiums
   *  dashboard widget so the row disappears in real time after Send. */
  lastRenewalEmailAt?: string;

  beneficiaries: Beneficiary[];
}

export interface FollowUp {
  id: string;
  clientId: string;
  type: FollowUpType;
  date: string;                // ISO date
  summary: string;
  details?: string;
  createdById: string;
  createdByName?: string;
  createdAt: string;
}

// === Derived view types ===

export interface ClientWithStats extends Client {
  aum: number;
  policyCount: number;
  activePolicyCount: number;
  /** Computed via calculateClientTags() — never persisted. */
  tags: TagValue[];
}
