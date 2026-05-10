import type { Carrier, Client, Policy, ProductType } from "@/lib/types";
import { CANADIAN_POSTAL_CODE_REGEX } from "@/lib/constants";

export const CSV_TEMPLATE_HEADERS = [
  "First_Name",
  "Last_Name",
  "Email",
  "Phone",
  "Birthday",
  "Address_Line1",
  "Unit",
  "City",
  "Province",
  "Postal_Code",
  "Policy_Number",
  "Products",
] as const;

export const CSV_EXPORT_HEADERS = [
  "First_Name",
  "Last_Name",
  "Email",
  "Phone",
  "Address_Line1",
  "Unit",
  "City",
  "Province",
  "Postal_Code",
  "Birthday",
  "Linked_To_Id",
  "Relationship",
  "Notes",
  "Created_At",
  "Products_List",
] as const;

const SUPPORTED_PROVINCES = ["BC", "AB", "ON"] as const;
const SUPPORTED_CARRIERS = ["Canada Life", "Manulife", "Sun Life", "iA", "Equitable Life"] as const satisfies readonly Carrier[];
const SUPPORTED_PRODUCT_TYPES = [
  "Critical Illness",
  "Medical",
  "Life",
  "Annuity",
  "Disability",
  "Segregated Fund",
  "TFSA",
  "RRSP",
  "Non-Registered",
  "Whole Life",
  "Term Insurance",
  "RESP",
  "FHSA",
] as const satisfies readonly ProductType[];

type CanonicalField =
  | "firstName"
  | "lastName"
  | "fullName"
  | "email"
  | "phone"
  | "streetAddress"
  | "unit"
  | "city"
  | "province"
  | "postalCode"
  | "birthday"
  | "linkedToId"
  | "relationship"
  | "notes"
  | "createdAt"
  | "policyNumber"
  | "products"
  | "fullAddress";

export interface CsvFieldMapping {
  sourceHeaders: string[];
  mappedFields: Partial<Record<CanonicalField, string>>;
  unmappedHeaders: string[];
}

export interface ImportRowError {
  field: string;
  message: string;
}

export interface ParsedImportProduct {
  carrier: Carrier;
  category: Policy["category"];
  productType: ProductType;
  productName: string;
  policyNumber: string;
  sumAssured: number;
  premium: number;
  paymentFrequency: Policy["paymentFrequency"];
  effectiveDate: string;
  status: Policy["status"];
  loanAmount?: number;
  loanRate?: number;
  isInvestmentLoan?: boolean;
  lender?: Policy["lender"];
  isCorporateInsurance?: boolean;
  businessName?: string;
}

export interface ParsedImportRow {
  rowNumber: number;
  raw: Record<string, string>;
  mappedClient: Omit<Client, "id" | "createdAt"> & { createdAt?: string };
  products: ParsedImportProduct[];
  errors: ImportRowError[];
  valid: boolean;
}

type RawRecord = Record<string, unknown>;

const FIELD_ALIASES: Record<CanonicalField, string[]> = {
  firstName: ["first_name", "firstname", "first name", "given name", "first"],
  lastName: ["last_name", "lastname", "last name", "surname", "family name", "last"],
  fullName: ["full_name", "fullname", "full name", "name", "client name"],
  email: ["email", "e-mail", "email address", "mail"],
  phone: ["phone", "mobile", "cell", "phone number", "telephone"],
  streetAddress: ["address_line1", "street", "street address", "address", "line1"],
  unit: ["unit", "suite", "apt", "apartment"],
  city: ["city", "town"],
  province: ["province", "state", "region"],
  postalCode: ["postal_code", "postal", "postal code", "zip", "zip code"],
  birthday: ["birthday", "date of birth", "dob"],
  linkedToId: ["linked_to_id", "linked to", "linked to id"],
  relationship: ["relationship", "relation"],
  notes: ["notes", "note", "remarks"],
  createdAt: ["created_at", "created at"],
  policyNumber: ["policy_number", "policy number", "policy no", "policy #"],
  products: ["products", "products_list", "policies", "policy list", "product details"],
  fullAddress: ["full_address", "full address"],
};

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getString(record: RawRecord, key?: string) {
  if (!key) return "";
  const value = record[key];
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function titleCaseName(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "", lastName: "" };
  }
  if (parts.length === 1) {
    return { firstName: titleCaseName(parts[0]), lastName: "" };
  }
  return {
    firstName: titleCaseName(parts.slice(0, -1).join(" ")),
    lastName: titleCaseName(parts.at(-1) ?? ""),
  };
}

export function buildCsvFieldMapping(headers: string[]): CsvFieldMapping {
  const normalizedMap = new Map(headers.map((header) => [normalizeHeader(header), header]));
  const mappedFields: Partial<Record<CanonicalField, string>> = {};

  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [CanonicalField, string[]][]) {
    const match = aliases.find((alias) => normalizedMap.has(alias));
    if (match) {
      mappedFields[field] = normalizedMap.get(match);
    }
  }

  const usedHeaders = new Set(Object.values(mappedFields));
  return {
    sourceHeaders: headers,
    mappedFields,
    unmappedHeaders: headers.filter((header) => !usedHeaders.has(header)),
  };
}

function parseProvince(value: string) {
  const normalized = value.trim().toUpperCase();
  return SUPPORTED_PROVINCES.includes(normalized as "BC" | "AB" | "ON")
    ? (normalized as "BC" | "AB" | "ON")
    : undefined;
}

function parseRelationship(value: string) {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const relationships = [
    "Spouse",
    "Child",
    "Parent",
    "Beneficiary",
    "Sibling",
    "Trustee",
    "Business Associate",
    "Other",
  ] as const;
  return relationships.find((item) => item.toLowerCase() === normalized.toLowerCase()) as Client["relationship"];
}

function parseCurrency(value: string) {
  const cleaned = value.replace(/[^0-9.-]/g, "");
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseDate(value: string) {
  if (!value.trim()) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

function parseFullAddress(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return {};
  const match = trimmed.match(/^(.*?),\s*([^,]+),\s*(BC|AB|ON)\s+([A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d)$/i);
  if (!match) {
    return { streetAddress: trimmed };
  }
  return {
    streetAddress: match[1]?.trim() ?? "",
    city: match[2]?.trim() ?? "",
    province: (match[3]?.toUpperCase() ?? "") as "BC" | "AB" | "ON",
    postalCode: match[4]?.toUpperCase().replace(/\s+/, " ") ?? "",
  };
}

function findCarrier(value: string) {
  const normalized = value.trim().toLowerCase();
  return SUPPORTED_CARRIERS.find((carrier) => carrier.toLowerCase() === normalized);
}

function findProductType(value: string) {
  const normalized = value.trim().toLowerCase();
  return SUPPORTED_PRODUCT_TYPES.find((type) => type.toLowerCase() === normalized);
}

export function formatProductsForCsv(products: Policy[]) {
  return products
    .map((policy) => `${policy.carrier}|${policy.productType}|${String(policy.premium)}`)
    .join("; ");
}

function escapeCsvCell(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
}

export function buildClientsExportCsv(clients: Client[], policies: Policy[]) {
  const lines = [CSV_EXPORT_HEADERS.join(",")];
  for (const client of clients) {
    const clientPolicies = policies.filter((policy) => policy.clientId === client.id);
    const row = [
      client.firstName,
      client.lastName,
      client.email,
      client.phone ?? "",
      client.streetAddress ?? "",
      client.unit ?? "",
      client.city ?? "",
      client.province ?? "",
      client.postalCode ?? "",
      client.birthday ?? "",
      client.linkedToId ?? "",
      client.relationship ?? "",
      client.notes ?? "",
      client.createdAt,
      formatProductsForCsv(clientPolicies),
    ].map((value) => escapeCsvCell(value));
    lines.push(row.join(","));
  }
  return lines.join("\n");
}

export function buildCsvTemplate() {
  return `${CSV_TEMPLATE_HEADERS.join(",")}\n`;
}

export function parseImportedRows(rows: RawRecord[]): { mapping: CsvFieldMapping; rows: ParsedImportRow[] } {
  const headers = Array.from(
    new Set(
      rows.flatMap((row) =>
        Object.keys(row).filter((key) => key !== "__parsed_extra"),
      ),
    ),
  );
  const mapping = buildCsvFieldMapping(headers);
  const timestamp = Date.now();

  const parsedRows = rows.map((rawRow, index) => {
    const errors: ImportRowError[] = [];
    const raw: Record<string, string> = {};
    for (const key of headers) {
      raw[key] = getString(rawRow, key);
    }

    let firstName = titleCaseName(getString(rawRow, mapping.mappedFields.firstName));
    let lastName = titleCaseName(getString(rawRow, mapping.mappedFields.lastName));

    if ((!firstName || !lastName) && mapping.mappedFields.fullName) {
      const split = splitFullName(getString(rawRow, mapping.mappedFields.fullName));
      firstName ||= split.firstName;
      lastName ||= split.lastName;
    }

    const email = getString(rawRow, mapping.mappedFields.email).toLowerCase();
    const phone = getString(rawRow, mapping.mappedFields.phone);
    const birthday = parseDate(getString(rawRow, mapping.mappedFields.birthday));
    const linkedToId = getString(rawRow, mapping.mappedFields.linkedToId) || undefined;
    const relationship = parseRelationship(getString(rawRow, mapping.mappedFields.relationship));
    const notes = getString(rawRow, mapping.mappedFields.notes) || undefined;
    const createdAt = parseDate(getString(rawRow, mapping.mappedFields.createdAt));

    let streetAddress = getString(rawRow, mapping.mappedFields.streetAddress);
    const unit = getString(rawRow, mapping.mappedFields.unit) || undefined;
    let city = getString(rawRow, mapping.mappedFields.city);
    let province = parseProvince(getString(rawRow, mapping.mappedFields.province));
    let postalCode = getString(rawRow, mapping.mappedFields.postalCode).toUpperCase();

    const fullAddressKey = mapping.mappedFields.fullAddress;
    if ((!streetAddress || !city || !province || !postalCode) && fullAddressKey) {
      const parsed = parseFullAddress(getString(rawRow, fullAddressKey));
      streetAddress ||= parsed.streetAddress ?? "";
      city ||= parsed.city ?? "";
      province ||= parsed.province;
      postalCode ||= parsed.postalCode ?? "";
      if (!parsed.city || !parsed.province || !parsed.postalCode) {
        errors.push({ field: "address", message: "Could not fully split Full Address into street, city, province, and postal code." });
      }
    }

    if (!firstName || !lastName) {
      errors.push({ field: "name", message: "First and last name are required." });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ field: "email", message: "Invalid email address." });
    }
    if (postalCode && !CANADIAN_POSTAL_CODE_REGEX.test(postalCode)) {
      errors.push({ field: "postalCode", message: "Invalid Canadian postal code." });
    }
    if (getString(rawRow, mapping.mappedFields.province) && !province) {
      errors.push({ field: "province", message: "Province must be BC, AB, or ON." });
    }

    const productsValue = getString(rawRow, mapping.mappedFields.products);
    const rowPolicyNumber = getString(rawRow, mapping.mappedFields.policyNumber);
    const products: ParsedImportProduct[] = [];

    if (productsValue) {
      productsValue
        .split(";")
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((item, productIndex) => {
          const [carrierPart, productTypePart, premiumPart] = item.split("|").map((part) => part.trim());
          if (!carrierPart || !productTypePart || !premiumPart) {
            errors.push({
              field: "products",
              message: `Product entry "${item}" must be Carrier|Product Type|Premium.`,
            });
            return;
          }

          const carrier = findCarrier(carrierPart);
          const productType = findProductType(productTypePart);
          const premium = parseCurrency(premiumPart);

          if (!carrier) {
            errors.push({ field: "products", message: `Unsupported carrier "${carrierPart}".` });
            return;
          }
          if (!productType) {
            errors.push({ field: "products", message: `Unsupported product type "${productTypePart}".` });
            return;
          }
          if (Number.isNaN(premium)) {
            errors.push({ field: "products", message: `Invalid premium "${premiumPart}".` });
            return;
          }

          products.push({
            carrier,
            category: "Insurance",
            productType,
            productName: productType,
            policyNumber:
              rowPolicyNumber && productIndex === 0
                ? rowPolicyNumber
                : `IMP-${timestamp}-${index + 1}-${productIndex + 1}`,
            sumAssured: 0,
            premium,
            paymentFrequency: "Annually" as Policy["paymentFrequency"],
            effectiveDate: new Date().toISOString().slice(0, 10),
            status: "active",
          });
        });
    }

    const mappedClient: ParsedImportRow["mappedClient"] = {
      firstName,
      lastName,
      email,
      phone: phone || undefined,
      streetAddress: streetAddress || undefined,
      unit,
      city: city || undefined,
      province,
      postalCode: postalCode || undefined,
      birthday,
      linkedToId,
      relationship,
      notes,
      createdAt,
    };

    return {
      rowNumber: index + 2,
      raw,
      mappedClient,
      products,
      errors,
      valid: errors.length === 0,
    } satisfies ParsedImportRow;
  });

  return { mapping, rows: parsedRows };
}
