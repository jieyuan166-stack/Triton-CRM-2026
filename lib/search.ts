// lib/search.ts
// Pure search aggregator — case-insensitive multi-field match across
// Clients and Policies. Kept as a function so it can be unit-tested
// without the React tree, and so the UI layer stays presentational.

import type { Client, EmailHistoryEntry, Policy } from "./types";
import { clientPath } from "./client-slug";
import { tokenMatch } from "./text-utils";

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

export interface EmailHit {
  kind: "email";
  id: string;
  href: string;
  primary: string;
  secondary: string;
  client: Client;
  email: EmailHistoryEntry;
}

export type SearchHit = ClientHit | PolicyHit | EmailHit;

export interface SearchResults {
  query: string;
  clients: ClientHit[];
  policies: PolicyHit[];
  emails: EmailHit[];
  total: number;
}

const PER_GROUP_LIMIT = 6;

function matches(query: string, fields: Array<string | undefined | null>): boolean {
  if (!query) return false;
  return tokenMatch(query, fields);
}

function stripHtml(value: string | undefined | null): string {
  if (!value) return "";
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function emailPolicyFields(entry: EmailHistoryEntry): string[] {
  const contexts = entry.policyContexts?.length
    ? entry.policyContexts
    : entry.policyNumber || entry.policyLabel
      ? [{ policyNumber: entry.policyNumber, policyLabel: entry.policyLabel }]
      : [];
  return contexts.flatMap((context) => [
    context.policyNumber,
    context.policyLabel,
  ]).filter(Boolean) as string[];
}

export function searchAll(
  rawQuery: string,
  clients: Client[],
  policies: Policy[]
): SearchResults {
  const q = rawQuery.trim().toLowerCase();
  if (!q) {
    return { query: rawQuery, clients: [], policies: [], emails: [], total: 0 };
  }

  // Clients: firstName / lastName / email / phone
  const clientHits: ClientHit[] = clients
    .filter((c) => {
      const clientPolicies = policies.filter((p) => p.clientId === c.id);
      return matches(q, [
        c.firstName,
        c.lastName,
        `${c.firstName} ${c.lastName}`,
        `${c.lastName} ${c.firstName}`,
        c.email,
        c.phone,
        c.streetAddress,
        c.city,
        c.province,
        c.postalCode,
        ...clientPolicies.flatMap((p) => [
          p.policyOwnerName,
          p.policyOwner2Name,
          ...(p.category === "Insurance"
            ? (p.insuredPersons ?? []).map((person) => person.name)
            : []),
        ]),
      ]);
    })
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
        p.policyOwnerName,
        p.policyOwner2Name,
        ...(p.category === "Insurance"
          ? (p.insuredPersons ?? []).map((person) => person.name)
          : []),
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

  const emailHits: EmailHit[] = clients
    .flatMap((client) =>
      (client.emailHistory ?? []).map((entry) => ({ client, entry }))
    )
    .filter(({ client, entry }) =>
      matches(q, [
        client.firstName,
        client.lastName,
        `${client.firstName} ${client.lastName}`,
        `${client.lastName} ${client.firstName}`,
        client.companyName,
        client.email,
        entry.subject,
        stripHtml(entry.body),
        entry.templateLabel,
        entry.communicationType,
        entry.policyNumber,
        entry.policyLabel,
        ...emailPolicyFields(entry),
        ...(entry.attachments ?? []).map((attachment) => attachment.filename),
      ])
    )
    .sort((a, b) => (a.entry.date > b.entry.date ? -1 : 1))
    .slice(0, PER_GROUP_LIMIT)
    .map(({ client, entry }) => ({
      kind: "email",
      id: entry.id,
      href: `${clientPath(client)}#activity`,
      primary: entry.subject || entry.templateLabel || "Email activity",
      secondary: [
        `${client.firstName} ${client.lastName}`.trim() || client.companyName,
        entry.templateLabel || entry.communicationType,
        entry.policyNumber ? `#${entry.policyNumber}` : undefined,
      ].filter(Boolean).join(" · "),
      client,
      email: entry,
    }));

  return {
    query: rawQuery,
    clients: clientHits,
    policies: policyHits,
    emails: emailHits,
    total: clientHits.length + policyHits.length + emailHits.length,
  };
}

/** Flatten grouped results into a single ordered list — used for keyboard nav. */
export function flattenHits(results: SearchResults): SearchHit[] {
  return [...results.clients, ...results.policies, ...results.emails];
}
