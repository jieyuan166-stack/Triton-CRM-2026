// lib/validators.ts — zod schemas for forms.
import { z } from "zod";
import {
  CANADIAN_POSTAL_CODE_REGEX,
  PROVINCE_CODES,
} from "./constants";
import {
  CARRIERS,
  INSURANCE_PRODUCTS,
  INVESTMENT_PRODUCTS,
  LENDERS,
  PAYMENT_FREQUENCIES,
} from "./types";

// === Policy form ===
// Insurance + Investment workflows. Beneficiaries / Maturity / Payment Term
// have all been removed per the simplified spec.
//
// productType is `z.string().min(1)` (instead of z.enum) because the valid
// set depends on `category`. The cross-field .refine() below enforces
// membership against the right list. This also lets the UI reset the field
// to "" when the user toggles category without breaking validation —
// the "required" message naturally surfaces.

/** Coerce a display string like "$1,500,000" / "350.50" into a clean number.
 *  CurrencyInput already emits numbers, but the form's submit handler runs
 *  every value through this as a defensive sweep so any bypass (paste into
 *  the field, programmatic setValue with a string) doesn't silently fail
 *  Zod with "Expected number, received string". Returns undefined for empty
 *  / non-numeric input. */
export const toCurrencyNumber = (v: unknown): number | undefined => {
  if (typeof v === "number") return Number.isNaN(v) ? undefined : v;
  if (typeof v !== "string") return undefined;
  const cleaned = v.replace(/[^\d.-]/g, "");
  if (cleaned === "" || cleaned === "." || cleaned === "-") return undefined;
  const n = Number(cleaned);
  return Number.isNaN(n) ? undefined : n;
};

const optionalPolicyString = z
  .string()
  .trim()
  .optional()
  .or(z.literal("").transform(() => undefined));

const insuredPersonFormSchema = z.object({
  name: z.string().trim(),
  clientId: z.string().trim().optional(),
});

export const policyFormSchema = z
  .object({
    clientId: z.string().min(1, "Client is required"),
    category: z.enum(["Insurance", "Investment"], {
      message: "Category is required",
    }),
    carrier: z.enum(CARRIERS as unknown as [string, ...string[]]),
    productType: z.string().min(1, "Product type is required"),
    productName: z
      .string()
      .trim()
      .optional()
      .or(z.literal("").transform(() => undefined)),
    policyNumber: z.string().trim().min(1, "Policy number is required"),
    // sumAssured is Death Benefit for Insurance and Initial Investment for
    // Investment. Premium/paymentFrequency only surface for Insurance.
    // Currency string-to-number coercion happens at the form layer (see
    // PolicyForm.coerceCurrencyValues) before zod ever sees these.
    sumAssured: z.number().positive("Must be > 0").optional(),
    premium: z.number().min(0, "Cannot be negative").optional(),
    paymentFrequency: z
      .enum(PAYMENT_FREQUENCIES as unknown as [string, ...string[]])
      .optional(),
    effectiveDate: z.string().min(1, "Effective date is required"),
    /** Insurance + Annually only. Stored as "MM-DD" (year-less). */
    premiumDate: z
      .string()
      .regex(/^\d{2}-\d{2}$/, "Use MM-DD format")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    status: z.enum(["active", "pending", "lapsed"]).optional(),

    // Corporate-insurance fields. Only used when category === "Insurance".
    isCorporateInsurance: z.boolean().optional(),
    businessName: z
      .string()
      .trim()
      .optional()
      .or(z.literal("").transform(() => undefined)),

    // Investment-loan fields. Only used when category === "Investment".
    // `lender` accepts "" because the form initializes the underlying Select
    // with an empty string to keep it controlled (see makeDefaults in
    // PolicyForm). Empty string is normalized to `undefined` so the persisted
    // shape stays clean. The cross-field `.refine()` below then enforces the
    // real requirement: lender is mandatory ONLY when
    // category === "Investment" && isInvestmentLoan === true.
    isInvestmentLoan: z.boolean().optional(),
    lender: z
      .enum(LENDERS as unknown as [string, ...string[]])
      .or(z.literal("").transform(() => undefined))
      .optional(),
    loanAmount: z.number().min(0).optional(),

    // Joint account fields. Applies to both Insurance and Investment.
    isJoint: z.boolean().optional(),
    jointWithClientId: z
      .string()
      .trim()
      .optional()
      .or(z.literal("").transform(() => undefined)),

    // Legal/business-party fields. Optional because old policies and
    // carrier-imported records may not have this metadata yet.
    policyOwnerName: optionalPolicyString,
    policyOwnerClientId: optionalPolicyString,
    policyOwner2Name: optionalPolicyString,
    policyOwner2ClientId: optionalPolicyString,
    insuredPersons: z.array(insuredPersonFormSchema).max(2).optional(),
  })
  .refine(
    (d) => {
      const allowed =
        d.category === "Insurance" ? INSURANCE_PRODUCTS : INVESTMENT_PRODUCTS;
      return (allowed as readonly string[]).includes(d.productType);
    },
    {
      message: "Product type does not match category",
      path: ["productType"],
    }
  )
  .refine(
    (d) => {
      // Investment-loan: lender required when toggled on
      if (d.category === "Investment" && d.isInvestmentLoan) {
        return !!d.lender;
      }
      return true;
    },
    { message: "Lender is required", path: ["lender"] }
  )
  .refine(
    (d) => {
      // Investment-loan: positive loan amount required when toggled on
      if (d.category === "Investment" && d.isInvestmentLoan) {
        return typeof d.loanAmount === "number" && d.loanAmount > 0;
      }
      return true;
    },
    { message: "Loan amount must be greater than 0", path: ["loanAmount"] }
  )
  // Category-specific required fields
  .refine(
    (d) =>
      d.category !== "Insurance" ||
      (typeof d.sumAssured === "number" && d.sumAssured > 0),
    { message: "Death benefit is required", path: ["sumAssured"] }
  )
  .refine(
    (d) =>
      d.category !== "Investment" ||
      d.status === "pending" ||
      (typeof d.sumAssured === "number" && d.sumAssured > 0),
    { message: "Initial investment is required", path: ["sumAssured"] }
  )
  .refine(
    (d) => d.category !== "Insurance" || typeof d.premium === "number",
    { message: "Premium is required", path: ["premium"] }
  )
  .refine(
    (d) => d.category !== "Insurance" || !!d.paymentFrequency,
    { message: "Payment frequency is required", path: ["paymentFrequency"] }
  )
  .refine(
    (d) => {
      // Corporate insurance: business name required when toggled on
      if (d.category === "Insurance" && d.isCorporateInsurance) {
        return !!d.businessName && d.businessName.trim().length > 0;
      }
      return true;
    },
    { message: "Business name is required", path: ["businessName"] }
  )
  .refine(
    (d) => {
      // Premium Date is only required for Insurance + Annually payments.
      // Monthly + Investment policies don't expose this field at all.
      if (d.category === "Insurance" && d.paymentFrequency === "Annual") {
        return !!d.premiumDate;
      }
      return true;
    },
    { message: "Premium date is required", path: ["premiumDate"] }
  )
  .refine(
    (d) => {
      if (!d.isJoint) return true;
      return !!d.jointWithClientId && d.jointWithClientId !== d.clientId;
    },
    { message: "Select the joint account partner", path: ["jointWithClientId"] }
  );

export type PolicyFormValues = z.infer<typeof policyFormSchema>;

// === Client form (rebuilt for the v2 Add Client dialog) ===

const optionalString = z
  .string()
  .trim()
  .optional()
  .or(z.literal("").transform(() => undefined));

export const clientFormSchema = z.object({
    firstName: z.string().trim().min(1, "First name is required"),
    lastName: z.string().trim().min(1, "Last name is required"),
    email: z
      .string()
      .trim()
      .min(1, "Email is required")
      .email("Invalid email"),

    phone: optionalString,

    streetAddress: optionalString,
    unit: optionalString,
    city: optionalString,
    province: z
      .enum(PROVINCE_CODES as unknown as [string, ...string[]])
      .optional(),
    postalCode: z
      .string()
      .trim()
      .optional()
      .or(z.literal("").transform(() => undefined))
      .refine(
        (v) => v === undefined || CANADIAN_POSTAL_CODE_REGEX.test(v),
        "Use the Canadian format, e.g. V6B 1A1"
      ),

    birthday: optionalString,

    notes: optionalString,
  });

export type ClientFormValues = z.infer<typeof clientFormSchema>;
