// lib/clients-query.ts
// Pure query/filter/sort/paginate function for the Clients directory.
//
// Why a pure function:
//   - The same code runs on the client (against DataProvider state) AND on the
//     server (against seed data, or — in Step 10 — against Prisma).
//   - Step 10 will replace the BODY of `queryClients` with Prisma calls;
//     the input/output contract stays identical, so call-sites don't change.

import { calculateClientTags } from "./client-tags";
import { TAG_VALUES, type TagValue } from "./constants";
import { parseCalendarDate } from "./date-utils";
import { tokenMatch } from "./text-utils";
import type { Client, FollowUp, Policy } from "./types";

// ===== Contract =====

export type ClientSortKey = "name" | "email" | "province" | "lastContact";
export type SortDir = "asc" | "desc";
export type RowsPerPage = 25 | 50 | 100;

export interface ClientQuery {
  /** Free-text search — matches name (first/last/full), email, or province (label or code). */
  search?: string;
  /** Filter to clients in any of these province codes. Empty/omitted = all provinces. */
  provinces?: string[];
  /** Filter to clients with ANY of these tags (OR semantics). Empty/omitted = all tags. */
  tags?: string[];
  sortKey?: ClientSortKey;
  sortDir?: SortDir;
  /** 1-indexed page number. */
  page?: number;
  perPage?: RowsPerPage;
}

export interface ClientRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  province?: string;
  /** Stored on the Client (JSON array column in DB). */
  tags: TagValue[];
  /** ISO timestamp/date of latest structured contact activity; undefined if no activity yet. */
  lastContactAt?: string;
  /** Derived stats (matches existing ClientWithStats) */
  aum: number;
  policyCount: number;
  activePolicyCount: number;
}

export interface ClientQueryResult {
  rows: ClientRow[];
  total: number;
  page: number;
  perPage: RowsPerPage;
  totalPages: number;
  /** Distinct values across the *unfiltered* dataset — feeds the filter dropdowns. */
  facets: {
    provinces: string[];
    tags: string[];
  };
}

// ===== Implementation =====

const DEFAULT_PER_PAGE: RowsPerPage = 25;

function normalize(s: string | undefined | null): string {
  return (s ?? "").toLowerCase();
}

function latestContactDate(values: Array<string | undefined>): string | undefined {
  let best: { value: string; time: number } | undefined;

  for (const value of values) {
    if (!value) continue;
    const time = parseCalendarDate(value).getTime();
    if (Number.isNaN(time)) continue;
    if (!best || time > best.time) best = { value, time };
  }

  return best?.value;
}

function buildRow(
  client: Client,
  policies: Policy[],
  followUps: FollowUp[]
): ClientRow {
  const cps = policies.filter((p) => p.clientId === client.id);
  const aum = cps
    .filter((p) => p.status === "active")
    .reduce((s, p) => s + p.sumAssured, 0);

  const lastContactAt = latestContactDate([
    ...followUps.filter((f) => f.clientId === client.id).map((f) => f.date),
    ...(client.emailHistory ?? []).map((entry) => entry.date),
  ]);

  return {
    id: client.id,
    firstName: client.firstName,
    lastName: client.lastName,
    email: client.email,
    phone: client.phone,
    province: client.province,
    tags: calculateClientTags(client, policies),
    lastContactAt,
    aum,
    policyCount: cps.length,
    activePolicyCount: cps.filter((p) => p.status === "active").length,
  };
}

function compare(a: ClientRow, b: ClientRow, key: ClientSortKey): number {
  switch (key) {
    case "name": {
      const an = `${a.lastName} ${a.firstName}`.toLowerCase();
      const bn = `${b.lastName} ${b.firstName}`.toLowerCase();
      return an.localeCompare(bn);
    }
    case "email":
      return normalize(a.email).localeCompare(normalize(b.email));
    case "province":
      return normalize(a.province).localeCompare(normalize(b.province));
    case "lastContact": {
      // Empty lastContact sorts as oldest
      const av = a.lastContactAt ?? "";
      const bv = b.lastContactAt ?? "";
      if (av < bv) return -1;
      if (av > bv) return 1;
      return 0;
    }
  }
}

/**
 * Apply search + province + tags + sort + pagination over Client/Policy/FollowUp.
 * Pure — no React, no I/O. Safe to call from client OR server code.
 */
export function queryClients(
  input: ClientQuery,
  data: { clients: Client[]; policies: Policy[]; followUps: FollowUp[] }
): ClientQueryResult {
  const {
    search = "",
    provinces = [],
    tags = [],
    sortKey = "name",
    sortDir = "asc",
    page = 1,
    perPage = DEFAULT_PER_PAGE,
  } = input;

  // 1. Build rows once. Tags are read from `client.tags` (stored).
  const allRows = data.clients.map((c) =>
    buildRow(c, data.policies, data.followUps)
  );

  // 2. Compute facets BEFORE filtering — dropdowns always show every option.
  const provinceFacet = Array.from(
    new Set(allRows.map((r) => r.province).filter((p): p is string => !!p))
  ).sort();
  // Tag facets are the four fixed enum values from lib/constants.
  const tagFacet = [...TAG_VALUES] as string[];

  // 3. Apply filters
  const q = search.trim();
  let filtered = allRows.filter((r) => {
    if (q) {
      const clientPolicies = data.policies.filter((policy) => policy.clientId === r.id);
      const fields = [
        r.firstName,
        r.lastName,
        `${r.firstName} ${r.lastName}`,
        `${r.lastName} ${r.firstName}`,
        r.email ?? "",
        r.phone ?? "",
        r.province ?? "",
        ...clientPolicies.flatMap((policy) => [
          policy.policyOwnerName,
          policy.policyOwner2Name,
          ...(policy.category === "Insurance"
            ? (policy.insuredPersons ?? []).map((person) => person.name)
            : []),
        ]),
      ];
      if (!tokenMatch(q, fields)) return false;
    }
    if (provinces.length > 0) {
      if (!r.province || !provinces.includes(r.province)) return false;
    }
    if (tags.length > 0) {
      // OR semantics: include row if any of its tags is in the filter set
      if (!r.tags.some((t) => tags.includes(t))) return false;
    }
    return true;
  });

  // 4. Sort
  filtered = filtered.sort((a, b) => {
    const c = compare(a, b, sortKey);
    return sortDir === "asc" ? c : -c;
  });

  // 5. Paginate
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * perPage;
  const rows = filtered.slice(start, start + perPage);

  return {
    rows,
    total,
    page: safePage,
    perPage,
    totalPages,
    facets: { provinces: provinceFacet, tags: tagFacet },
  };
}

/** Convert a URL `URLSearchParams` into a `ClientQuery`. Used by the API route. */
export function parseClientQueryParams(params: URLSearchParams): ClientQuery {
  const num = (v: string | null) => (v ? Number(v) : undefined);
  const list = (v: string | null) =>
    v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined;

  const perPageRaw = num(params.get("perPage"));
  const perPage: RowsPerPage =
    perPageRaw === 50 ? 50 : perPageRaw === 100 ? 100 : 25;

  const sortKeyRaw = params.get("sortKey");
  const sortKey: ClientSortKey =
    sortKeyRaw === "email" ||
    sortKeyRaw === "province" ||
    sortKeyRaw === "lastContact"
      ? sortKeyRaw
      : "name";

  const sortDir: SortDir = params.get("sortDir") === "desc" ? "desc" : "asc";

  return {
    search: params.get("search") ?? undefined,
    provinces: list(params.get("provinces")),
    tags: list(params.get("tags")),
    sortKey,
    sortDir,
    page: num(params.get("page")) ?? 1,
    perPage,
  };
}
