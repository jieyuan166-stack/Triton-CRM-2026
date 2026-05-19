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
import { daysUntil, parseCalendarDate } from "./date-utils";
import { tokenMatch } from "./text-utils";
import type { Client, FollowUp, Policy } from "./types";

// ===== Contract =====

export type ClientSortKey = "name" | "email" | "province" | "lastContact";
export type FollowUpSortKey = "deadline" | "importance";
export type SortDir = "asc" | "desc";
export type RowsPerPage = 25 | 50 | 100;

export interface ClientQuery {
  /** Free-text search — matches name (first/last/full), email, or province (label or code). */
  search?: string;
  /** Filter to clients in any of these province codes. Empty/omitted = all provinces. */
  provinces?: string[];
  /** Filter to clients with ANY of these tags (OR semantics). Empty/omitted = all tags. */
  tags?: string[];
  tagMatchMode?: "any" | "all";
  needsFollowUpOnly?: boolean;
  followUpDueOnly?: boolean;
  followUpSort?: FollowUpSortKey;
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
  followUpDueCount: number;
  nextFollowUpDeadline?: string;
  highestFollowUpImportance?: "High" | "Medium" | "Low";
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

function fullClientAddress(client: Client | undefined): string {
  if (!client) return "";
  return [
    client.streetAddress,
    client.unit,
    client.city,
    client.province,
    client.postalCode,
  ]
    .filter(Boolean)
    .join(" ");
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

function needsFollowUp(lastContactAt: string | undefined): boolean {
  if (!lastContactAt) return true;
  const time = parseCalendarDate(lastContactAt).getTime();
  if (Number.isNaN(time)) return true;
  return Date.now() - time > 90 * 24 * 60 * 60 * 1000;
}

const IMPORTANCE_WEIGHT: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

function followUpTargetDate(followUp: FollowUp): string | undefined {
  return followUp.deadline || followUp.date;
}

function isFollowUpDue(followUp: FollowUp): boolean {
  if (followUp.deadline) return daysUntil(followUp.deadline) <= 30;
  return followUp.importance === "High";
}

function summarizeFollowUps(followUps: FollowUp[]) {
  const due = followUps.filter(isFollowUpDue);
  const dated = due
    .map((followUp) => followUpTargetDate(followUp))
    .filter((date): date is string => !!date)
    .sort((a, b) => parseCalendarDate(a).getTime() - parseCalendarDate(b).getTime());
  const importance = due
    .map((followUp) => followUp.importance)
    .filter((value): value is "High" | "Medium" | "Low" => !!value)
    .sort((a, b) => IMPORTANCE_WEIGHT[a] - IMPORTANCE_WEIGHT[b])[0];
  return {
    dueCount: due.length,
    nextDeadline: dated[0],
    highestImportance: importance,
  };
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

  const clientFollowUps = followUps.filter((f) => f.clientId === client.id);
  const followUpSummary = summarizeFollowUps(clientFollowUps);

  const lastContactAt = latestContactDate([
    ...clientFollowUps.map((f) => f.date),
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
    followUpDueCount: followUpSummary.dueCount,
    nextFollowUpDeadline: followUpSummary.nextDeadline,
    highestFollowUpImportance: followUpSummary.highestImportance,
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
    tagMatchMode = "any",
    needsFollowUpOnly = false,
    followUpDueOnly = false,
    followUpSort,
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
        fullClientAddress(data.clients.find((client) => client.id === r.id)),
        ...clientPolicies.flatMap((policy) => [
          policy.carrier,
          policy.productType,
          policy.productName,
          policy.policyNumber,
          policy.businessName,
          policy.lender,
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
      const matchesTags =
        tagMatchMode === "all"
          ? tags.every((tag) => r.tags.includes(tag as TagValue))
          : r.tags.some((t) => tags.includes(t));
      if (!matchesTags) return false;
    }
    if (needsFollowUpOnly && !needsFollowUp(r.lastContactAt)) return false;
    if (followUpDueOnly && r.followUpDueCount === 0) return false;
    return true;
  });

  // 4. Sort
  filtered = filtered.sort((a, b) => {
    if (followUpDueOnly && followUpSort === "deadline") {
      const av = a.nextFollowUpDeadline ? parseCalendarDate(a.nextFollowUpDeadline).getTime() : Number.POSITIVE_INFINITY;
      const bv = b.nextFollowUpDeadline ? parseCalendarDate(b.nextFollowUpDeadline).getTime() : Number.POSITIVE_INFINITY;
      if (av !== bv) return av - bv;
    }
    if (followUpDueOnly && followUpSort === "importance") {
      const av = a.highestFollowUpImportance ? IMPORTANCE_WEIGHT[a.highestFollowUpImportance] : 99;
      const bv = b.highestFollowUpImportance ? IMPORTANCE_WEIGHT[b.highestFollowUpImportance] : 99;
      if (av !== bv) return av - bv;
    }
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
    tagMatchMode: params.get("tagMatchMode") === "all" ? "all" : "any",
    needsFollowUpOnly: params.get("needsFollowUp") === "true",
    followUpDueOnly: params.get("followUpDue") === "true",
    followUpSort: params.get("followUpSort") === "importance" ? "importance" : "deadline",
    sortKey,
    sortDir,
    page: num(params.get("page")) ?? 1,
    perPage,
  };
}
