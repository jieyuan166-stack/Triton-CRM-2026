import { formatPostalCode, isProvinceCode, type ProvinceCode } from "@/lib/constants";
import type {
  Carrier,
  Client,
  PaymentFrequency,
  Policy,
  PolicyCategory,
  PolicyStatus,
  ProductType,
} from "@/lib/types";

export type EquitableRawRecord = Record<string, unknown>;

export interface EquitableFieldIssue {
  field: string;
  message: string;
}

export type EquitablePreviewAction =
  | "create-client-policy"
  | "create-policy"
  | "update-policy"
  | "needs-review";

export interface EquitableClientInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  streetAddress?: string;
  city?: string;
  province?: ProvinceCode;
  postalCode?: string;
  birthday?: string;
  notes?: string;
}

export interface EquitablePolicyInput {
  carrier: Carrier;
  category: PolicyCategory;
  productType: ProductType;
  productName: string;
  policyNumber: string;
  sumAssured: number;
  premium: number;
  paymentFrequency: PaymentFrequency;
  effectiveDate: string;
  premiumDate?: string;
  status: PolicyStatus;
}

export interface EquitablePreviewRow {
  rowNumber: number;
  raw: EquitableRawRecord;
  clientInput: EquitableClientInput;
  policyInput: EquitablePolicyInput;
  clientKey: string;
  matchedClientId?: string;
  matchedClientName?: string;
  existingPolicyId?: string;
  action: EquitablePreviewAction;
  errors: EquitableFieldIssue[];
  warnings: EquitableFieldIssue[];
  valid: boolean;
}

const CARRIER: Carrier = "Equitable Life";

const POLICY_ALIASES = [
  "policy number",
  "policy no",
  "policy #",
  "policy",
  "contract number",
  "contract no",
  "contract",
];
const OWNER_ALIASES = ["owner", "owner name", "client", "client name", "insured", "insured name", "life insured"];
const FIRST_NAME_ALIASES = ["first name", "firstname", "given name", "first"];
const LAST_NAME_ALIASES = ["last name", "lastname", "surname", "family name", "last"];
const DOB_ALIASES = ["dob", "date of birth", "birthday", "birth date"];
const EMAIL_ALIASES = ["email", "e-mail", "email address"];
const PHONE_ALIASES = ["phone", "telephone", "mobile", "cell", "phone number"];
const STREET_ALIASES = ["street", "street address", "address", "address line1", "address line 1"];
const CITY_ALIASES = ["city", "town"];
const PROVINCE_ALIASES = ["province", "state"];
const POSTAL_ALIASES = ["postal code", "postal", "zip", "zipcode", "zip code"];
const PRODUCT_ALIASES = ["product", "product name", "product description", "plan", "plan name"];
const PRODUCT_TYPE_ALIASES = ["product type", "plan type", "type"];
const CATEGORY_ALIASES = ["category", "policy category"];
const FACE_ALIASES = ["face amount", "coverage", "sum assured", "insurance amount", "death benefit"];
const AUM_ALIASES = ["aum", "market value", "account value", "accumulated value", "investment amount", "initial investment"];
const PREMIUM_ALIASES = ["premium", "annual premium", "modal premium", "payment amount"];
const FREQUENCY_ALIASES = ["payment frequency", "frequency", "payment mode", "mode"];
const EFFECTIVE_ALIASES = ["effective date", "issue date", "policy date", "start date"];
const PREMIUM_DATE_ALIASES = ["premium date", "next premium date", "due date", "premium due date", "paid to date"];
const STATUS_ALIASES = ["status", "policy status"];

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9# ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  return "";
}

function readField(record: EquitableRawRecord, aliases: string[]): string {
  const lookup = new Map<string, unknown>();
  Object.entries(record).forEach(([key, value]) => {
    lookup.set(normalizeKey(key), value);
  });

  for (const alias of aliases) {
    const found = lookup.get(normalizeKey(alias));
    const text = normalizeText(found);
    if (text) return text;
  }

  return "";
}

function parseMoney(value: string): number {
  const cleaned = value.replace(/[^0-9.-]/g, "");
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseStatus(value: string): PolicyStatus {
  const v = value.toLowerCase();
  if (v.includes("lapse") || v.includes("terminated") || v.includes("inactive")) return "lapsed";
  if (v.includes("pending") || v.includes("submitted")) return "pending";
  return "active";
}

function parseFrequency(value: string, category: PolicyCategory): PaymentFrequency {
  const v = value.toLowerCase();
  if (v.includes("month")) return "Monthly";
  if (v.includes("quarter")) return "Quarterly";
  if (v.includes("semi")) return "Semi-Annual";
  if (v.includes("annual") || v.includes("year")) return "Annual";
  return category === "Insurance" ? "Annual" : "Monthly";
}

function parseDateOnly(value: string): string | undefined {
  const raw = value.trim();
  if (!raw) return undefined;

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;

  const slash = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return undefined;
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const cleaned = fullName.replace(/\s+/g, " ").trim();
  if (!cleaned) return { firstName: "", lastName: "" };
  const comma = cleaned.match(/^([^,]+),\s*(.+)$/);
  if (comma) return { firstName: comma[2].trim(), lastName: comma[1].trim() };
  const parts = cleaned.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) ?? "" };
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeComparable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function clientName(client: Pick<Client, "firstName" | "lastName">): string {
  return `${client.firstName} ${client.lastName}`.trim();
}

function inferCategory(categoryText: string, productText: string): PolicyCategory {
  const combined = `${categoryText} ${productText}`.toLowerCase();
  if (
    combined.includes("investment") ||
    combined.includes("tfsa") ||
    combined.includes("rrsp") ||
    combined.includes("resp") ||
    combined.includes("fhsa") ||
    combined.includes("non registered") ||
    combined.includes("non-registered") ||
    combined.includes("segregated") ||
    combined.includes("fund") ||
    combined.includes("annuity")
  ) {
    return "Investment";
  }
  return "Insurance";
}

function inferProductType(category: PolicyCategory, productText: string): ProductType | undefined {
  const text = productText.toLowerCase();

  if (category === "Investment") {
    if (text.includes("tfsa")) return "TFSA";
    if (text.includes("rrsp") || text.includes("lira") || text.includes("rif")) return "RRSP";
    if (text.includes("resp")) return "RESP";
    if (text.includes("fhsa")) return "FHSA";
    if (text.includes("non registered") || text.includes("non-registered") || text.includes("open")) {
      return "Non-Registered";
    }
    if (text.includes("segregated") || text.includes("fund") || text.includes("annuity")) {
      return "Non-Registered";
    }
    return undefined;
  }

  if (text.includes("term")) return "Term Insurance";
  if (text.includes("critical") || text.includes("illness") || text.includes("ci")) return "Critical Illness";
  if (
    text.includes("whole") ||
    text.includes("life") ||
    text.includes("equimax") ||
    text.includes("universal") ||
    text.includes("insurance")
  ) {
    return "Whole Life";
  }

  return undefined;
}

function parseProvince(value: string): ProvinceCode | undefined {
  const code = value.trim().toUpperCase().slice(0, 2);
  return isProvinceCode(code) ? code : undefined;
}

function parseAddress(record: EquitableRawRecord): {
  streetAddress?: string;
  city?: string;
  province?: ProvinceCode;
  postalCode?: string;
  warnings: EquitableFieldIssue[];
} {
  const warnings: EquitableFieldIssue[] = [];
  const street = readField(record, STREET_ALIASES);
  const city = readField(record, CITY_ALIASES);
  const provinceText = readField(record, PROVINCE_ALIASES);
  const postalText = readField(record, POSTAL_ALIASES);
  const province = parseProvince(provinceText);
  const postalCode = postalText ? formatPostalCode(postalText) : undefined;

  if (provinceText && !province) {
    warnings.push({ field: "province", message: `Unsupported province "${provinceText}". Only BC, AB, ON are selectable.` });
  }

  return {
    streetAddress: street || undefined,
    city: city || undefined,
    province,
    postalCode,
    warnings,
  };
}

function makePlaceholderEmail(policyNumber: string, rowNumber: number): string {
  const token = normalizeComparable(policyNumber || `row-${rowNumber}`) || `row${rowNumber}`;
  return `equitable+${token}@triton.invalid`;
}

function makeClientKey(input: EquitableClientInput): string {
  return [
    normalizeComparable(`${input.firstName}${input.lastName}`),
    input.birthday ?? "",
    normalizeComparable(input.postalCode ?? input.streetAddress ?? ""),
  ].join("|");
}

function findClientMatch(
  input: EquitableClientInput,
  clients: Client[],
  existingPolicy?: Policy
): Client | undefined {
  if (existingPolicy) return clients.find((client) => client.id === existingPolicy.clientId);

  const email = input.email.toLowerCase();
  if (email && !email.endsWith("@triton.invalid")) {
    const byEmail = clients.find((client) => client.email.toLowerCase() === email);
    if (byEmail) return byEmail;
  }

  const phone = normalizePhone(input.phone ?? "");
  if (phone) {
    const byPhone = clients.find((client) => normalizePhone(client.phone ?? "") === phone);
    if (byPhone) return byPhone;
  }

  const name = normalizeComparable(`${input.firstName}${input.lastName}`);
  if (!name) return undefined;

  if (input.birthday) {
    const byBirthday = clients.find(
      (client) =>
        normalizeComparable(`${client.firstName}${client.lastName}`) === name &&
        client.birthday === input.birthday
    );
    if (byBirthday) return byBirthday;
  }

  const addressKey = normalizeComparable(`${input.streetAddress ?? ""}${input.postalCode ?? ""}`);
  if (addressKey) {
    const byAddress = clients.find(
      (client) =>
        normalizeComparable(`${client.firstName}${client.lastName}`) === name &&
        normalizeComparable(`${client.streetAddress ?? ""}${client.postalCode ?? ""}`) === addressKey
    );
    if (byAddress) return byAddress;
  }

  return undefined;
}

export function parseEquitableJsonText(text: string): EquitableRawRecord[] {
  const parsed = JSON.parse(text) as unknown;
  const candidate =
    Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object"
        ? (parsed as { policies?: unknown; records?: unknown; data?: unknown }).policies ??
          (parsed as { policies?: unknown; records?: unknown; data?: unknown }).records ??
          (parsed as { policies?: unknown; records?: unknown; data?: unknown }).data
        : null;

  if (!Array.isArray(candidate)) {
    throw new Error("Expected a JSON array, or an object with policies, records, or data array.");
  }

  return candidate.filter(
    (item): item is EquitableRawRecord => !!item && typeof item === "object" && !Array.isArray(item)
  );
}

export function buildEquitablePreview(
  rawRecords: EquitableRawRecord[],
  clients: Client[],
  policies: Policy[]
): EquitablePreviewRow[] {
  return rawRecords.map((record, index) => {
    const rowNumber = index + 1;
    const errors: EquitableFieldIssue[] = [];
    const warnings: EquitableFieldIssue[] = [];

    const policyNumber = readField(record, POLICY_ALIASES).trim();
    if (!policyNumber) errors.push({ field: "policyNumber", message: "Missing policy number." });

    const fullName = readField(record, OWNER_ALIASES);
    const firstNameRaw = readField(record, FIRST_NAME_ALIASES);
    const lastNameRaw = readField(record, LAST_NAME_ALIASES);
    const split = splitName(fullName);
    const firstName = firstNameRaw || split.firstName;
    const lastName = lastNameRaw || split.lastName;
    if (!firstName || !lastName) errors.push({ field: "client", message: "Missing owner first or last name." });

    const productName = readField(record, PRODUCT_ALIASES) || readField(record, PRODUCT_TYPE_ALIASES);
    if (!productName) errors.push({ field: "product", message: "Missing product name." });

    const category = inferCategory(readField(record, CATEGORY_ALIASES), productName);
    const productType = inferProductType(category, `${productName} ${readField(record, PRODUCT_TYPE_ALIASES)}`);
    if (!productType) {
      errors.push({
        field: "productType",
        message: `Could not map product type from "${productName}".`,
      });
    }

    const birthday = parseDateOnly(readField(record, DOB_ALIASES));
    const effectiveDate = parseDateOnly(readField(record, EFFECTIVE_ALIASES)) ?? new Date().toISOString().slice(0, 10);
    const premiumDate = parseDateOnly(readField(record, PREMIUM_DATE_ALIASES));
    const address = parseAddress(record);
    warnings.push(...address.warnings);

    const faceAmount = parseMoney(readField(record, FACE_ALIASES));
    const aum = parseMoney(readField(record, AUM_ALIASES));
    const premium = parseMoney(readField(record, PREMIUM_ALIASES));
    const amount = category === "Investment" ? aum || faceAmount : faceAmount;

    const clientInput: EquitableClientInput = {
      firstName,
      lastName,
      email: readField(record, EMAIL_ALIASES) || makePlaceholderEmail(policyNumber, rowNumber),
      phone: readField(record, PHONE_ALIASES) || undefined,
      streetAddress: address.streetAddress,
      city: address.city,
      province: address.province,
      postalCode: address.postalCode,
      birthday,
      notes: "Imported from Equitable Advisor Policy Inquiry.",
    };

    const policyInput: EquitablePolicyInput = {
      carrier: CARRIER,
      category,
      productType: productType ?? (category === "Investment" ? "Non-Registered" : "Whole Life"),
      productName: productName || (productType ?? category),
      policyNumber,
      sumAssured: amount,
      premium,
      paymentFrequency: parseFrequency(readField(record, FREQUENCY_ALIASES), category),
      effectiveDate,
      premiumDate: category === "Insurance" ? premiumDate : undefined,
      status: parseStatus(readField(record, STATUS_ALIASES)),
    };

    const existingPolicy = policies.find(
      (policy) => policy.policyNumber.toLowerCase() === policyNumber.toLowerCase()
    );
    const matchedClient = findClientMatch(clientInput, clients, existingPolicy);

    const valid = errors.length === 0;
    const action: EquitablePreviewAction = !valid
      ? "needs-review"
      : existingPolicy
        ? "update-policy"
        : matchedClient
          ? "create-policy"
          : "create-client-policy";

    return {
      rowNumber,
      raw: record,
      clientInput,
      policyInput,
      clientKey: makeClientKey(clientInput),
      matchedClientId: matchedClient?.id,
      matchedClientName: matchedClient ? clientName(matchedClient) : undefined,
      existingPolicyId: existingPolicy?.id,
      action,
      errors,
      warnings,
      valid,
    };
  });
}

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildEquitablePreviewCsv(rows: EquitablePreviewRow[]): string {
  const headers = [
    "Action",
    "Client",
    "Matched_Client",
    "Policy_Number",
    "Product",
    "Category",
    "Face_or_AUM",
    "Premium",
    "Effective_Date",
    "Premium_Date",
    "Validation",
  ];

  const body = rows.map((row) =>
    [
      row.action,
      `${row.clientInput.firstName} ${row.clientInput.lastName}`.trim(),
      row.matchedClientName ?? "",
      row.policyInput.policyNumber,
      row.policyInput.productName,
      row.policyInput.category,
      row.policyInput.sumAssured,
      row.policyInput.premium,
      row.policyInput.effectiveDate,
      row.policyInput.premiumDate ?? "",
      [...row.errors, ...row.warnings].map((issue) => issue.message).join("; "),
    ].map(csvCell).join(",")
  );

  return [headers.join(","), ...body].join("\n");
}
