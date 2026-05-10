// components/providers/DataProvider.tsx
// In-memory data layer for Steps 3–9 (mock).
// Wraps the dashboard route group; Step 10 swaps the implementation for Prisma server actions.
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { calculateClientTags } from "@/lib/client-tags";
import { seedClients, seedFollowUps, seedPolicies } from "@/lib/mock-data";
import {
  RESTORE_PENDING_KEY,
  type BackupSnapshot,
} from "@/lib/settings-types";
import type {
  Beneficiary,
  Client,
  ClientWithStats,
  EmailHistoryEntry,
  FollowUp,
  Policy,
} from "@/lib/types";

const DATA_STORAGE_KEY = "triton:crm-data-v1";

// === Public context shape ===

interface DataContextValue {
  // raw collections
  clients: Client[];
  policies: Policy[];
  followUps: FollowUp[];

  // queries
  getClient(id: string): Client | undefined;
  getClientWithStats(id: string): ClientWithStats | undefined;
  listClientsWithStats(): ClientWithStats[];
  getPolicy(id: string): Policy | undefined;
  getPoliciesByClient(clientId: string): Policy[];
  getFollowUpsByClient(clientId: string): FollowUp[];

  // mutations — clients
  createClient(input: Omit<Client, "id" | "createdAt">): Client;
  updateClient(id: string, patch: Partial<Omit<Client, "id">>): Client | null;
  deleteClient(id: string): boolean;

  // mutations — policies. Caller supplies premiumDate explicitly (Insurance
  // + Annually only); for Monthly / Investment it can be left undefined.
  createPolicy(
    input: Omit<Policy, "id" | "beneficiaries"> & {
      beneficiaries: Omit<Beneficiary, "id" | "policyId">[];
    }
  ): Policy;
  updatePolicy(
    id: string,
    patch: Partial<Omit<Policy, "id" | "beneficiaries">> & {
      beneficiaries?: Omit<Beneficiary, "id" | "policyId">[];
    }
  ): Policy | null;
  deletePolicy(id: string): boolean;

  // mutations — follow-ups
  createFollowUp(input: Omit<FollowUp, "id" | "createdAt">): FollowUp;
  deleteFollowUp(id: string): boolean;

  // mutations — communication log
  /** Append a sent-email record to the given client's history. Generates
   *  the entry id if the caller doesn't supply one. Returns the saved
   *  entry, or null if the client doesn't exist. */
  appendEmailHistory(
    clientId: string,
    entry: Omit<EmailHistoryEntry, "id" | "date"> &
      Partial<Pick<EmailHistoryEntry, "id" | "date">>
  ): EmailHistoryEntry | null;

  /** Stamp `lastRenewalEmailAt` on a policy so the Upcoming Premiums
   *  widget hides it for the suppression window. ISO timestamp; defaults
   *  to now if the caller doesn't supply one. */
  markRenewalEmailSent(policyId: string, at?: string): void;

  /** Stamp `lastBirthdayEmailAt` on a client — same suppression purpose
   *  but for the Upcoming Birthdays widget. */
  markBirthdayEmailSent(clientId: string, at?: string): void;

  /** Prepend a free-text auto-log block to `client.notes`. Keeps the
   *  existing notes intact below a separator so manual notes are never
   *  destroyed. */
  prependClientNote(clientId: string, block: string): void;

  // bulk — used by backup/restore
  /** Read-only snapshot of the current data layer. Used by the Backups
   *  section to embed restorable state in BackupRecord and to download
   *  exportable .json files. */
  getSnapshot(): BackupSnapshot;
  /** Overwrite all three collections in a single render. The shape is
   *  validated; bad records are dropped silently and the orphan sweep runs
   *  so the post-replace state always satisfies the no-orphan invariant. */
  replaceAll(snapshot: BackupSnapshot): { ok: boolean; error?: string };
}

const DataContext = createContext<DataContextValue | null>(null);

// === Helpers ===

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function calcAUM(policies: Policy[]): number {
  return policies
    .filter((p) => p.status === "active")
    .reduce((sum, p) => sum + p.sumAssured, 0);
}

// === Provider ===

/** Strip any policies / follow-ups whose clientId doesn't appear in the
 *  given client list. Used at boot to clean stale seed data, and as a
 *  belt-and-suspenders sweep inside `deleteClient`. Pure — easy to test. */
function pruneOrphans<T extends { clientId: string }>(
  list: T[],
  clients: Pick<Client, "id">[]
): T[] {
  if (list.length === 0) return list;
  const live = new Set(clients.map((c) => c.id));
  return list.filter((x) => live.has(x.clientId));
}

function sanitizeSnapshot(snapshot: {
  clients?: unknown[];
  policies?: unknown[];
  followUps?: unknown[];
}): {
  clients: Client[];
  policies: Policy[];
  followUps: FollowUp[];
} {
  const clients = Array.isArray(snapshot.clients)
    ? (snapshot.clients.filter(
        (c): c is Client =>
          !!c && typeof c === "object" && typeof (c as Client).id === "string"
      ) as Client[])
    : [];
  const policies = Array.isArray(snapshot.policies)
    ? (snapshot.policies.filter(
        (p): p is Policy =>
          !!p &&
          typeof p === "object" &&
          typeof (p as Policy).id === "string" &&
          typeof (p as Policy).clientId === "string"
      ) as Policy[])
    : [];
  const followUps = Array.isArray(snapshot.followUps)
    ? (snapshot.followUps.filter(
        (f): f is FollowUp =>
          !!f &&
          typeof f === "object" &&
          typeof (f as FollowUp).id === "string" &&
          typeof (f as FollowUp).clientId === "string"
      ) as FollowUp[])
    : [];

  return {
    clients,
    policies: pruneOrphans(policies, clients),
    followUps: pruneOrphans(followUps, clients),
  };
}

/** Lazy initial state. Returns either:
 *   - the seed (with a one-time orphan sweep), or
 *   - the snapshot stashed in localStorage right before a window.reload()
 *     by BackupsSection, if one is present and looks valid.
 *
 * This is what makes Restore actually visible: the user clicks Restore →
 * we write to localStorage → reload → this initializer picks it up → the
 * whole app renders with the backed-up data.
 *
 * Bad records in the snapshot are silently dropped; orphans are then
 * pruned so the invariant "no policy without a parent client" is preserved
 * even if the snapshot was hand-edited. */
function readPendingRestore(): {
  clients: Client[];
  policies: Policy[];
  followUps: FollowUp[];
} | null {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(RESTORE_PENDING_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return sanitizeSnapshot(JSON.parse(raw) as BackupSnapshot);
  } catch {
    return null;
  }
}

function readPersistedData(): {
  clients: Client[];
  policies: Policy[];
  followUps: FollowUp[];
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DATA_STORAGE_KEY);
    if (!raw) return null;
    return sanitizeSnapshot(JSON.parse(raw) as BackupSnapshot);
  } catch {
    return null;
  }
}

function readInitialData(): {
  clients: Client[];
  policies: Policy[];
  followUps: FollowUp[];
} {
  return (
    readPendingRestore() ??
    readPersistedData() ?? {
      clients: seedClients,
      policies: pruneOrphans(seedPolicies, seedClients),
      followUps: pruneOrphans(seedFollowUps, seedClients),
    }
  );
}

export function DataProvider({ children }: { children: ReactNode }) {
  // One-time orphan sweep on the seed data: any seed policy / follow-up that
  // points at a client id no longer present in seedClients gets dropped here.
  // This makes the invariant "no policy without a parent client" true from
  // the very first render, instead of relying on cascade-on-delete alone.
  const [initialData] = useState(readInitialData);
  const [clients, setClients] = useState<Client[]>(initialData.clients);
  const [policies, setPolicies] = useState<Policy[]>(initialData.policies);
  const [followUps, setFollowUps] = useState<FollowUp[]>(initialData.followUps);

  // Clear the pending-restore key once it's been consumed, so a *second*
  // refresh doesn't re-apply it on top of any user edits made in between.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(RESTORE_PENDING_KEY);
    } catch {
      /* swallow — private mode etc. */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        DATA_STORAGE_KEY,
        JSON.stringify({
          version: 1,
          capturedAt: new Date().toISOString(),
          clients,
          policies,
          followUps,
        } satisfies BackupSnapshot)
      );
    } catch {
      /* localStorage can fail in private mode or if quota is exceeded. */
    }
  }, [clients, policies, followUps]);

  // queries — wrapped in useCallback to keep referential stability
  const getClient = useCallback(
    (id: string) => clients.find((c) => c.id === id),
    [clients]
  );

  const getPoliciesByClient = useCallback(
    (clientId: string) => policies.filter((p) => p.clientId === clientId),
    [policies]
  );

  const getClientWithStats = useCallback(
    (id: string): ClientWithStats | undefined => {
      const c = clients.find((x) => x.id === id);
      if (!c) return undefined;
      const cps = policies.filter((p) => p.clientId === id);
      return {
        ...c,
        aum: calcAUM(cps),
        policyCount: cps.length,
        activePolicyCount: cps.filter((p) => p.status === "active").length,
        tags: calculateClientTags(c, policies),
      };
    },
    [clients, policies]
  );

  const listClientsWithStats = useCallback((): ClientWithStats[] => {
    return clients.map((c) => {
      const cps = policies.filter((p) => p.clientId === c.id);
      return {
        ...c,
        aum: calcAUM(cps),
        policyCount: cps.length,
        activePolicyCount: cps.filter((p) => p.status === "active").length,
        tags: calculateClientTags(c, policies),
      };
    });
  }, [clients, policies]);

  const getPolicy = useCallback(
    (id: string) => policies.find((p) => p.id === id),
    [policies]
  );

  const getFollowUpsByClient = useCallback(
    (clientId: string) =>
      followUps
        .filter((f) => f.clientId === clientId)
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [followUps]
  );

  // === Mutations: clients ===
  const createClient: DataContextValue["createClient"] = useCallback((input) => {
    const next: Client = {
      ...input,
      id: uid("cli"),
      createdAt: new Date().toISOString(),
    };
    setClients((prev) => [...prev, next]);
    return next;
  }, []);

  const updateClient: DataContextValue["updateClient"] = useCallback(
    (id, patch) => {
      let updated: Client | null = null;
      setClients((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          updated = { ...c, ...patch, id: c.id };
          return updated;
        })
      );
      return updated;
    },
    []
  );

  // Cascade-delete a client and everything that hangs off them.
  //
  // Earlier this function set a closure variable INSIDE the setClients
  // updater (`deleted = next.length !== prev.length`) and then read it
  // back synchronously to decide whether to cascade. Under React 18's
  // batched updates and Strict-Mode double-invocation that read raced the
  // updater — bulk delete would remove clients but leave their policies
  // behind, which is exactly the "0 clients, 5 policies" symptom.
  //
  // Fix: never branch on closure mutation. We always run the cascade
  // (filtering policies/followUps by a non-existent clientId is a no-op)
  // and we read existence from the current `clients` snapshot held in the
  // closure of the useCallback rather than from inside an updater.
  const deleteClient: DataContextValue["deleteClient"] = useCallback(
    (id) => {
      const existed = clients.some((c) => c.id === id);
      setClients((prev) => prev.filter((c) => c.id !== id));
      setPolicies((prev) => prev.filter((p) => p.clientId !== id));
      setFollowUps((prev) => prev.filter((f) => f.clientId !== id));
      return existed;
    },
    [clients]
  );

  // === Mutations: policies ===
  const createPolicy: DataContextValue["createPolicy"] = useCallback((input) => {
    const policyId = uid("pol");
    const beneficiaries: Beneficiary[] = input.beneficiaries.map((b) => ({
      ...b,
      id: uid("ben"),
      policyId,
    }));
    const next: Policy = {
      ...input,
      id: policyId,
      beneficiaries,
    };
    setPolicies((prev) => [...prev, next]);
    return next;
  }, []);

  const updatePolicy: DataContextValue["updatePolicy"] = useCallback(
    (id, patch) => {
      let updated: Policy | null = null;
      setPolicies((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;

          const merged: Policy = { ...p, ...patch, id: p.id, beneficiaries: p.beneficiaries };

          // Replace beneficiaries if provided
          if (patch.beneficiaries) {
            merged.beneficiaries = patch.beneficiaries.map((b) => ({
              ...b,
              id: uid("ben"),
              policyId: id,
            }));
          }

          updated = merged;
          return merged;
        })
      );
      return updated;
    },
    []
  );

  const deletePolicy: DataContextValue["deletePolicy"] = useCallback((id) => {
    let deleted = false;
    setPolicies((prev) => {
      const next = prev.filter((p) => p.id !== id);
      deleted = next.length !== prev.length;
      return next;
    });
    return deleted;
  }, []);

  // === Mutations: follow-ups ===
  const createFollowUp: DataContextValue["createFollowUp"] = useCallback((input) => {
    const next: FollowUp = {
      ...input,
      id: uid("fup"),
      createdAt: new Date().toISOString(),
    };
    setFollowUps((prev) => [...prev, next]);
    return next;
  }, []);

  const deleteFollowUp: DataContextValue["deleteFollowUp"] = useCallback((id) => {
    let deleted = false;
    setFollowUps((prev) => {
      const next = prev.filter((f) => f.id !== id);
      deleted = next.length !== prev.length;
      return next;
    });
    return deleted;
  }, []);

  // === Mutations: communication log ===
  //
  // We store email history inline on the Client object (rather than a
  // separate top-level collection) because the spec models it that way and
  // because the only consumer is the per-client detail page. If a future
  // step adds a global "Outbox" view, this will want to be lifted to its
  // own array — but for now keeping the data co-located minimises plumbing.
  const appendEmailHistory: DataContextValue["appendEmailHistory"] =
    useCallback((clientId, entry) => {
      let saved: EmailHistoryEntry | null = null;
      setClients((prev) =>
        prev.map((c) => {
          if (c.id !== clientId) return c;
          const newEntry: EmailHistoryEntry = {
            id: entry.id ?? uid("eml"),
            date: entry.date ?? new Date().toISOString(),
            subject: entry.subject,
            body: entry.body,
            templateLabel: entry.templateLabel,
          };
          saved = newEntry;
          // Bump lastContactedAt at the same time so the "last contacted"
          // signal matches the most recent send across all templates —
          // saves the caller from having to make two separate calls.
          return {
            ...c,
            emailHistory: [...(c.emailHistory ?? []), newEntry],
            lastContactedAt: newEntry.date,
          };
        })
      );
      return saved;
    }, []);

  const markRenewalEmailSent: DataContextValue["markRenewalEmailSent"] =
    useCallback((policyId, at) => {
      const stamp = at ?? new Date().toISOString();
      setPolicies((prev) =>
        prev.map((p) =>
          p.id === policyId ? { ...p, lastRenewalEmailAt: stamp } : p
        )
      );
    }, []);

  const markBirthdayEmailSent: DataContextValue["markBirthdayEmailSent"] =
    useCallback((clientId, at) => {
      const stamp = at ?? new Date().toISOString();
      setClients((prev) =>
        prev.map((c) =>
          c.id === clientId ? { ...c, lastBirthdayEmailAt: stamp } : c
        )
      );
    }, []);

  const prependClientNote: DataContextValue["prependClientNote"] = useCallback(
    (clientId, block) => {
      setClients((prev) =>
        prev.map((c) => {
          if (c.id !== clientId) return c;
          // Separator keeps prior notes legible; em-dashes render cleanly
          // inside the existing whitespace-pre-wrap UI without needing
          // markup.
          const existing = (c.notes ?? "").trim();
          const next = existing ? `${block}\n———\n${existing}` : block;
          return { ...c, notes: next };
        })
      );
    },
    []
  );

  // === Bulk: snapshot / replaceAll for backup-restore ===

  const getSnapshot: DataContextValue["getSnapshot"] = useCallback(() => {
    return {
      version: 1,
      capturedAt: new Date().toISOString(),
      clients,
      policies,
      followUps,
    };
  }, [clients, policies, followUps]);

  const replaceAll: DataContextValue["replaceAll"] = useCallback(
    (snapshot) => {
      // Defensive validation — even though BackupsSection has already
      // validated structure, this is the last gate before we overwrite the
      // user's data. Bad records are dropped; orphans are pruned.
      if (
        !snapshot ||
        snapshot.version !== 1 ||
        !Array.isArray(snapshot.clients) ||
        !Array.isArray(snapshot.policies) ||
        !Array.isArray(snapshot.followUps)
      ) {
        return { ok: false, error: "Snapshot has unexpected shape" };
      }
      const nextClients = (snapshot.clients as Client[]).filter(
        (c) => !!c && typeof c === "object" && typeof c.id === "string"
      );
      const nextPolicies = pruneOrphans(
        (snapshot.policies as Policy[]).filter(
          (p) =>
            !!p &&
            typeof p === "object" &&
            typeof p.id === "string" &&
            typeof p.clientId === "string"
        ),
        nextClients
      );
      const nextFollowUps = pruneOrphans(
        (snapshot.followUps as FollowUp[]).filter(
          (f) =>
            !!f &&
            typeof f === "object" &&
            typeof f.id === "string" &&
            typeof f.clientId === "string"
        ),
        nextClients
      );
      setClients(nextClients);
      setPolicies(nextPolicies);
      setFollowUps(nextFollowUps);
      return { ok: true };
    },
    []
  );

  const value = useMemo<DataContextValue>(
    () => ({
      clients,
      policies,
      followUps,
      getClient,
      getClientWithStats,
      listClientsWithStats,
      getPolicy,
      getPoliciesByClient,
      getFollowUpsByClient,
      createClient,
      updateClient,
      deleteClient,
      createPolicy,
      updatePolicy,
      deletePolicy,
      createFollowUp,
      deleteFollowUp,
      appendEmailHistory,
      markRenewalEmailSent,
      markBirthdayEmailSent,
      prependClientNote,
      getSnapshot,
      replaceAll,
    }),
    [
      clients,
      policies,
      followUps,
      getClient,
      getClientWithStats,
      listClientsWithStats,
      getPolicy,
      getPoliciesByClient,
      getFollowUpsByClient,
      createClient,
      updateClient,
      deleteClient,
      createPolicy,
      updatePolicy,
      deletePolicy,
      createFollowUp,
      deleteFollowUp,
      appendEmailHistory,
      markRenewalEmailSent,
      markBirthdayEmailSent,
      prependClientNote,
      getSnapshot,
      replaceAll,
    ]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

// === Hook ===

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) {
    throw new Error("useData must be used inside <DataProvider>");
  }
  return ctx;
}
