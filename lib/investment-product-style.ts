import type { ProductType } from "@/lib/types";

const INVESTMENT_PRODUCT_TONES: Partial<Record<ProductType, string>> = {
  "Non-Registered": "bg-slate-100 text-slate-700 ring-slate-200",
  TFSA: "bg-sky-50 text-sky-700 ring-sky-100",
  RRSP: "bg-indigo-50 text-indigo-700 ring-indigo-100",
  "Spousal RRSP": "bg-indigo-100 text-indigo-800 ring-indigo-200",
  LIRA: "bg-violet-50 text-violet-700 ring-violet-100",
  RRIF: "bg-purple-50 text-purple-700 ring-purple-100",
  RESP: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  FHSA: "bg-teal-50 text-teal-700 ring-teal-100",
  "Segregated Fund": "bg-rose-50 text-rose-700 ring-rose-100",
};

export function investmentProductTone(productType: ProductType | string) {
  return (
    INVESTMENT_PRODUCT_TONES[productType as ProductType] ??
    "bg-slate-100 text-slate-700 ring-slate-200"
  );
}
