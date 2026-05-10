// lib/carrier-colors.ts — single source of truth for carrier brand colors.
import type { Carrier } from "./types";

export const CARRIER_COLORS: Record<Carrier, string> = {
  "Canada Life": "#D32F2F",
  Manulife: "#00A758",
  "Sun Life": "#FDB813",
  iA: "#003DA5",
  "Equitable Life": "#6A1B9A",
};
