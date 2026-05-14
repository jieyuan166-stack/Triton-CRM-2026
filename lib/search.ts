// lib/search.ts
// Pure search aggregator — case-insensitive multi-field match across
// Clients and Policies. Kept as a function so it can be unit-tested
// without the React tree, and so the UI layer stays presentational.

import type { Client, Policy } from "./types";
import { clientPath } from "./client-slug";

export interface ClientHit {
  kind: "client";
  id: string;
  /** Where in /clients/[slug] the hit links to */
  href: string;
  primary: string;     // "Wei Zhang"
  secondary: string;   // "VIP · Software Engineer"
  client: Client;
}

export interface PolicyHit {
  kind: "policy";
  id: string;
  href: string;
  primary: string;     // "Sun Par Protector II"
  secondary: string;   // "Sun Life · Insurance · SUN-771204"
  policy: Policy;
}

export type SearchHit = ClientHit | PolicyHit;

export interface SearchResults {
  query: string;
  clients: ClientHit[];
  policies: PolicyHit[];
  total: number;
}

const PER_GROUP_LIMIT = 6;

function matches(query: string, fields: Array<string | undefined | null>): boolean {
  if (!query) return false;
  return fields.some(
    (f) => typeof f === "string" && f.toLowerCase().includes(query)
  );
}

export function searchAll(
  rawQuery: string,
  clients: Client[],
  policies: Policy[]
): SearchResults {
  const q = rawQuery.trim().toLowerCase();
  if (!q) {
    return { query: rawQuery, clients: [], policies: [], total: 0 };
  }

  // Clients: firstName / lastName / email / phone
  const clientHits: ClientHit[] = clients
    .filter((c) =>
      matches(q, [c.firstName, c.lastName, `${c.firstName} ${c.lastName}`, c.email, c.phone])
    )
    .slice(0, PER_GROUP_LIMIT)
    .map((c) => ({
      kind: "client",
      id: c.id,
      href: clientPath(c),
      primary: `${c.firstName} ${c.lastName}`,
      secondary: [c.email, c.province].filter(Boolean).join(" · "),
      client: c,
    }));

  // Policies: policyNumber / carrier / productName / category / productType
  const policyHits: PolicyHit[] = policies
    .filter((p) =>
      matches(q, [
        p.policyNumber,
        p.carrier,
        p.productName,
        p.category,
        p.productType,
      ])
    )
    .slice(0, PER_GROUP_LIMIT)
    .map((p) => ({
      kind: "policy",
      id: p.id,
      href: `/policies/${p.id}`,
      primary: p.productName,
      secondary: `${p.carrier} · ${p.category} · ${p.policyNumber}`,
      policy: p,
    }));

  return {
    query: rawQuery,
    clients: clientHits,
    policies: policyHits,
    total: clientHits.length + policyHits.length,
  };
}

/** Flatten grouped results into a single ordered list — used for keyboard nav. */
export function flattenHits(results: SearchResults): SearchHit[] {
  return [...results.clients, ...results.policies];
}
