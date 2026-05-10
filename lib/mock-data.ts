// lib/mock-data.ts
// Empty seed for a clean CRM workspace. Real production data lives in the
// SQLite/Prisma database and user-created in-app state; no demo clients,
// policies, follow-ups, or backup records should appear by default.

import type { Client, FollowUp, Policy } from "./types";

export const seedClients: Client[] = [];
export const seedPolicies: Policy[] = [];
export const seedFollowUps: FollowUp[] = [];
