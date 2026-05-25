import type { ProductType } from "@/lib/types";

const INVESTMENT_PRODUCT_TONES: Partial<Record<ProductType, string>> = {
  "Non-Registered": "text-slate-700",
  TFSA: "text-sky-700",
  RRSP: "text-indigo-700",
  "Spousal RRSP": "text-indigo-800",
  LIRA: "text-violet-700",
  RRIF: "text-purple-700",
  RESP: "text-emerald-700",
  FHSA: "text-teal-700",
  "Segregated Fund": "text-rose-700",
};

const INSURANCE_PRODUCT_TONES: Partial<Record<ProductType, string>> = {
  "Term Insurance": "text-blue-700",
  "Critical Illness": "text-rose-700",
  "Whole Life": "text-amber-700",
  Life: "text-blue-700",
  Medical: "text-rose-700",
  Disability: "text-orange-700",
};

export function investmentProductTone(productType: ProductType | string) {
  return (
    INVESTMENT_PRODUCT_TONES[productType as ProductType] ??
    "text-slate-700"
  );
}

export function insuranceProductTone(productType: ProductType | string) {
  return (
    INSURANCE_PRODUCT_TONES[productType as ProductType] ??
    "text-blue-700"
  );
}
