// components/providers/DataProvider.tsx
// Client-side facade over the Prisma-backed data API.
// Confirmed mutations only update local state after the NAS accepts the write.
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
import {
  buildClientSlug,
  buildUniqueClientSlug,
  ensureClientSlug,
  ensureUniqueClientSlugs,
} from "@/lib/client-slug";
import { normalizeClientNotes, removeCommunicationNoteBlocks } from "@/lib/communication-notes";
import { dedupePolicies, getPolicyPortfolioAmount } from "@/lib/portfolio-metrics";
import { type BackupSnapshot } from "@/lib/settings-types";
import { toTitleCaseName } from "@/lib/text-utils";
import type {
  Beneficiary,
  Client,
  ClientRelationship,
  ClientWithStats,
  EmailHistoryEntry,
  EmailReminderSend,
  FollowUp,
  Policy,
} from "@/lib/types";

// === Public context shape ===

interface DataContextValue {
  // raw collections
  clients: Client[];
  policies: Policy[];
  followUps: FollowUp[];
  relationships: ClientRelationship[];
  emailReminderSends: EmailReminderSend[];
  dataStatus: "loading" | "ready" | "error";
  dataError?: string;
  reloadData(): Promise<void>;

  // queries
  getClient(id: string): Client | undefined;
  getClientBySlug(slug: string): Client | undefined;
  resolveClientParam(param: string): Client | undefined;
  getClientWithStats(id: string): ClientWithStats | undefined;
  listClientsWithStats(): ClientWithStats[];
  getPolicy(id: string): Policy | undefined;
  getPoliciesByClient(clientId: string): Policy[];
  getFollowUpsByClient(clientId: string): FollowUp[];
  getClientRelationships(clientId: string): ClientRelationship[];

  // mutations — clients
  createClientAsync(
    input: Omit<Client, "id" | "createdAt">,
    relationships?: Array<{
      toClientId: string;
      relationship: ClientRelationship["relationship"];
    }>
  ): Promise<Client>;
  updateClientAsync(id: string, patch: Partial<Omit<Client, "id">>): Promise<Client | null>;
  deleteClient(id: string): Promise<boolean>;
  replaceClientRelationshipsAsync(
    clientId: string,
    input: Array<{ toClientId: string; relationship: ClientRelationship["relationship"] }>
  ): Promise<ClientRelationship[]>;

  // mutations — policies. Caller supplies premiumDate explicitly (Insurance
  // + Annually only); for Monthly / Investment it can be left undefined.
  createPolicy(
    input: Omit<Policy, "id" | "beneficiaries"> & {
      beneficiaries: Omit<Beneficiary, "id" | "policyId">[];
    }
  ): Promise<Policy>;
  updatePolicy(
    id: string,
    patch: Partial<Omit<Policy, "id" | "beneficiaries">> & {
      beneficiaries?: Omit<Beneficiary, "id" | "policyId">[];
    }
  ): Promise<Policy | null>;
  deletePolicy(id: string): Promise<boolean>;

  // mutations — follow-ups
  createFollowUp(input: Omit<FollowUp, "id" | "createdAt">): Promise<FollowUp>;
  completeFollowUp(id: string, completedAt?: string): Promise<boolean>;
  deleteFollowUp(id: string): Promise<boolean>;

  recordEmailReminderSend(input: Omit<EmailReminderSend, "id" | "createdAt"> & Partial<Pick<EmailReminderSend, "id" | "createdAt">>): Promise<EmailReminderSend | null>;
  markEmailReminderSendsSeen(ids: string[], seenAt?: string): Promise<void>;

  // mutations — communication log
  /** Append a sent-email record to the given client's history. Generates
   *  the entry id if the caller doesn't supply one. Returns the saved
   *  entry, or null if the client doesn't exist. */
  appendEmailHistory(
    clientId: string,
    entry: Omit<EmailHistoryEntry, "id" | "date"> &
      Partial<Pick<EmailHistoryEntry, "id" | "date">>
  ): Promise<EmailHistoryEntry | null>;
  updateEmailHistory(
    clientId: string,
    entryId: string,
    patch: Partial<Omit<EmailHistoryEntry, "id" | "date" | "policyId" | "policyNumber" | "policyLabel">> & {
      policyId?: string | null;
      policyNumber?: string | null;
      policyLabel?: string | null;
      policyContexts?: EmailHistoryEntry["policyContexts"] | null;
      attachments?: EmailHistoryEntry["attachments"] | null;
    }
  ): Promise<EmailHistoryEntry | null>;
  /** Delete one or more sent-email history entries for a client. Returns
   *  the number removed from local state. */
  deleteEmailHistory(clientId: string, entryIds: string[]): Promise<number>;

  // bulk — used by backup/restore
  /** Read-only snapshot of the current data layer. Used by the Backups
   *  section to embed restorable state in BackupRecord and to download
   *  exportable .json files. */
  getSnapshot(): BackupSnapshot;
  /** Overwrite all three collections in a single render. The shape is
   *  validated; bad records are dropped silently and the orphan sweep runs
   *  so the post-replace state always satisfies the no-orphan invariant. */
  replaceAll(snapshot: BackupSnapshot): Promise<{ ok: boolean; error?: string }>;
}

const DataContext = createContext<DataContextValue | null>(null);

// === Helpers ===

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function calcAUM(policies: Policy[]): number {
  return dedupePolicies(policies)
    .filter((p) => p.status === "active" && p.category === "Investment")
    .reduce((sum, p) => sum + getPolicyPortfolioAmount(p), 0);
}

function visiblePoliciesForClient(policies: Policy[], clientId: string): Policy[] {
  return dedupePolicies(
    policies.filter(
      (p) =>
        p.clientId === clientId ||
        (p.isJoint && p.jointWithClientId === clientId) ||
        p.policyOwnerClientId === clientId ||
        p.policyOwner2ClientId === clientId
    )
  );
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

function prunePolicyJointReferences(
  list: Policy[],
  clients: Pick<Client, "id">[]
): Policy[] {
  const live = new Set(clients.map((c) => c.id));
  return list.map((policy) => {
    const hasValidJoint =
      !!policy.isJoint &&
      !!policy.jointWithClientId &&
      live.has(policy.jointWithClientId) &&
      policy.jointWithClientId !== policy.clientId;
    return hasValidJoint
      ? policy
      : { ...policy, isJoint: false, jointWithClientId: undefined };
  });
}

function pruneRelationships(
  list: ClientRelationship[],
  clients: Pick<Client, "id">[]
): ClientRelationship[] {
  if (list.length === 0) return list;
  const live = new Set(clients.map((c) => c.id));
  const seen = new Set<string>();
  return list.filter((relationship) => {
    if (
      !live.has(relationship.fromClientId) ||
      !live.has(relationship.toClientId) ||
      relationship.fromClientId === relationship.toClientId
    ) {
      return false;
    }
    const key = `${relationship.fromClientId}:${relationship.toClientId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sanitizeSnapshot(snapshot: {
  clients?: unknown[];
  policies?: unknown[];
  followUps?: unknown[];
  relationships?: unknown[];
  emailReminderSends?: unknown[];
}): {
  clients: Client[];
  policies: Policy[];
  followUps: FollowUp[];
  relationships: ClientRelationship[];
  emailReminderSends: EmailReminderSend[];
} {
  const clients = Array.isArray(snapshot.clients)
    ? (snapshot.clients.filter(
        (c): c is Client =>
          !!c && typeof c === "object" && typeof (c as Client).id === "string"
      ) as Client[])
    : [];
  const clientsWithSlugs = ensureUniqueClientSlugs(
    clients.map((client) => ensureClientSlug(client))
  );
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
  const emailReminderSends = Array.isArray(snapshot.emailReminderSends)
    ? (snapshot.emailReminderSends.filter(
        (r): r is EmailReminderSend =>
          !!r &&
          typeof r === "object" &&
          typeof (r as EmailReminderSend).id === "string" &&
          typeof (r as EmailReminderSend).dedupeKey === "string" &&
          typeof (r as EmailReminderSend).clientId === "string" &&
          typeof (r as EmailReminderSend).type === "string"
      ) as EmailReminderSend[])
    : [];
  const relationships = Array.isArray(snapshot.relationships)
    ? (snapshot.relationships.filter(
        (r): r is ClientRelationship =>
          !!r &&
          typeof r === "object" &&
          typeof (r as ClientRelationship).id === "string" &&
          typeof (r as ClientRelationship).fromClientId === "string" &&
          typeof (r as ClientRelationship).toClientId === "string"
      ) as ClientRelationship[])
    : [];

  return {
    clients: clientsWithSlugs,
    policies: prunePolicyJointReferences(pruneOrphans(policies, clientsWithSlugs), clientsWithSlugs),
    followUps: pruneOrphans(followUps, clientsWithSlugs),
    relationships: pruneRelationships(relationships, clientsWithSlugs),
    emailReminderSends,
  };
}

function readInitialData(): {
  clients: Client[];
  policies: Policy[];
  followUps: FollowUp[];
  relationships: ClientRelationship[];
  emailReminderSends: EmailReminderSend[];
} {
  return {
    clients: ensureUniqueClientSlugs([]),
    policies: [],
    followUps: [],
    relationships: [],
    emailReminderSends: [],
  };
}

async function persistAction(action: string, payload: Record<string, unknown>) {
  const res = await fetch("/api/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || json.ok !== true) {
    throw new Error(json.error || `Persist failed (${res.status})`);
  }
}

function buildClientUpdate(
  id: string,
  patch: Partial<Omit<Client, "id">>,
  sourceClients: Client[]
): { updated: Client; patch: Partial<Omit<Client, "id">> } | null {
  const current = sourceClients.find((c) => c.id === id);
  if (!current) return null;

  const normalizedPatch = { ...patch };
  if (patch.firstName !== undefined) {
    normalizedPatch.firstName = toTitleCaseName(patch.firstName);
  }
  if (patch.lastName !== undefined) {
    normalizedPatch.lastName = toTitleCaseName(patch.lastName);
  }
  if (patch.notes !== undefined) {
    normalizedPatch.notes = normalizeClientNotes(patch.notes) ?? "";
  }

  const updated: Client = {
    ...current,
    ...normalizedPatch,
    id: current.id,
    slug:
      normalizedPatch.firstName !== undefined ||
      normalizedPatch.lastName !== undefined
        ? buildClientSlug({
            id: current.id,
            firstName: normalizedPatch.firstName ?? current.firstName,
            lastName: normalizedPatch.lastName ?? current.lastName,
          })
        : current.slug ?? buildUniqueClientSlug(current, sourceClients),
  };

  if (
    normalizedPatch.firstName !== undefined ||
    normalizedPatch.lastName !== undefined
  ) {
    updated.slug = buildUniqueClientSlug(updated, sourceClients);
  }

  const patchWithSlug =
    normalizedPatch.firstName !== undefined ||
    normalizedPatch.lastName !== undefined
      ? { ...normalizedPatch, slug: updated.slug }
      : normalizedPatch.slug
        ? normalizedPatch
        : { ...normalizedPatch, slug: updated.slug };

  return { updated, patch: patchWithSlug };
}

export function DataProvider({ children }: { children: ReactNode }) {
  // One-time orphan sweep on the seed data: any seed policy / follow-up that
  // points at a client id no longer present in loaded clients gets dropped here.
  // This makes the invariant "no policy without a parent client" true from
  // the very first render, instead of relying on cascade-on-delete alone.
  const [initialData] = useState(readInitialData);
  const [clients, setClients] = useState<Client[]>(initialData.clients);
  const [policies, setPolicies] = useState<Policy[]>(initialData.policies);
  const [followUps, setFollowUps] = useState<FollowUp[]>(initialData.followUps);
  const [relationships, setRelationships] = useState<ClientRelationship[]>(
    initialData.relationships
  );
  const [emailReminderSends, setEmailReminderSends] = useState<EmailReminderSend[]>(
    initialData.emailReminderSends
  );
  const [dataStatus, setDataStatus] =
    useState<DataContextValue["dataStatus"]>("loading");
  const [dataError, setDataError] = useState<string | undefined>(undefined);

  const reloadData = useCallback(async () => {
    const response = await fetch("/api/data", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not refresh data");
    const next = sanitizeSnapshot(await response.json());
    setClients(next.clients);
    setPolicies(next.policies);
    setFollowUps(next.followUps);
    setRelationships(next.relationships);
    setEmailReminderSends(next.emailReminderSends);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/data", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`Data load failed (${res.status})`);
        return res.json() as Promise<{
          clients?: Client[];
          policies?: Policy[];
          followUps?: FollowUp[];
          relationships?: ClientRelationship[];
          emailReminderSends?: EmailReminderSend[];
        }>;
      })
      .then((data) => {
        if (cancelled) return;
        const next = sanitizeSnapshot(data);
        setClients(next.clients);
        setPolicies(next.policies);
        setFollowUps(next.followUps);
        setRelationships(next.relationships);
        setEmailReminderSends(next.emailReminderSends);
        setDataStatus("ready");
        setDataError(undefined);
      })
      .catch((error) => {
        console.error("[DataProvider] Prisma data hydrate failed", error);
        if (!cancelled) {
          setDataStatus("error");
          setDataError(error instanceof Error ? error.message : "Data load failed");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // queries — wrapped in useCallback to keep referential stability
  const getClient = useCallback(
    (id: string) => clients.find((c) => c.id === id),
    [clients]
  );

  const getClientBySlug = useCallback(
    (slug: string) => clients.find((c) => c.slug === slug),
    [clients]
  );

  const resolveClientParam = useCallback(
    (param: string) => clients.find((c) => c.slug === param || c.id === param),
    [clients]
  );

  const getPoliciesByClient = useCallback(
    (clientId: string) => visiblePoliciesForClient(policies, clientId),
    [policies]
  );

  const getClientWithStats = useCallback(
    (id: string): ClientWithStats | undefined => {
      const c = clients.find((x) => x.id === id);
      if (!c) return undefined;
      const cps = visiblePoliciesForClient(policies, id);
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
      const cps = visiblePoliciesForClient(policies, c.id);
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

  const getClientRelationships = useCallback(
    (clientId: string) =>
      relationships.filter(
        (relationship) =>
          relationship.fromClientId === clientId ||
          relationship.toClientId === clientId
      ),
    [relationships]
  );

  // === Mutations: clients ===
  const createClientAsync: DataContextValue["createClientAsync"] = useCallback(
    async (input, relationshipInput = []) => {
      const id = uid("cli");
      const normalizedInput = {
        ...input,
        firstName: toTitleCaseName(input.firstName),
        lastName: toTitleCaseName(input.lastName),
      };
      const next: Client = {
        ...normalizedInput,
        id,
        slug: buildUniqueClientSlug(
          {
            id,
            firstName: normalizedInput.firstName,
            lastName: normalizedInput.lastName,
          },
          clients
        ),
        createdAt: new Date().toISOString(),
      };

      const liveClientIds = new Set(clients.map((client) => client.id));
      const seen = new Set<string>();
      const nextRelationships = relationshipInput.flatMap((item) => {
        if (
          !item.toClientId ||
          item.toClientId === id ||
          !liveClientIds.has(item.toClientId) ||
          seen.has(item.toClientId)
        ) {
          return [];
        }
        seen.add(item.toClientId);
        return [{
          id: uid("rel"),
          fromClientId: id,
          toClientId: item.toClientId,
          relationship: item.relationship,
          createdAt: new Date().toISOString(),
        }];
      });

      await persistAction("client.create", {
        client: next,
        relationships: nextRelationships,
      });
      setClients((prev) => [...prev, next]);
      if (nextRelationships.length > 0) {
        setRelationships((prev) => [...prev, ...nextRelationships]);
      }
      return next;
    },
    [clients]
  );

  const updateClientAsync: DataContextValue["updateClientAsync"] = useCallback(
    async (id, patch) => {
      const prepared = buildClientUpdate(id, patch, clients);
      if (!prepared) return null;
      await persistAction("client.update", { id, patch: prepared.patch });
      setClients((prev) => prev.map((c) => (c.id === id ? prepared.updated : c)));
      return prepared.updated;
    },
    [clients]
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
    async (id) => {
      const existed = clients.some((c) => c.id === id);
      if (!existed) return false;
      await persistAction("client.delete", { id });
      setClients((prev) => prev.filter((c) => c.id !== id));
      setPolicies((prev) =>
        prev
          .filter((p) => p.clientId !== id)
          .map((p) =>
            p.jointWithClientId === id
              ? { ...p, isJoint: false, jointWithClientId: undefined }
              : p
          )
      );
      setFollowUps((prev) => prev.filter((f) => f.clientId !== id));
      setRelationships((prev) =>
        prev.filter(
          (relationship) =>
            relationship.fromClientId !== id && relationship.toClientId !== id
        )
      );
      return existed;
    },
    [clients]
  );

  const replaceClientRelationshipsAsync: DataContextValue["replaceClientRelationshipsAsync"] =
    useCallback(
      async (clientId, input) => {
        const liveClientIds = new Set(clients.map((client) => client.id));
        const seen = new Set<string>();
        const nextRows: ClientRelationship[] = input.flatMap((item) => {
          if (
            !item.toClientId ||
            item.toClientId === clientId ||
            !liveClientIds.has(item.toClientId) ||
            seen.has(item.toClientId)
          ) {
            return [];
          }
          seen.add(item.toClientId);
          return [{
            id: uid("rel"),
            fromClientId: clientId,
            toClientId: item.toClientId,
            relationship: item.relationship,
            createdAt: new Date().toISOString(),
          }];
        });
        await persistAction("clientRelationships.replace", { clientId, relationships: nextRows });
        setRelationships((prev) => [
          ...prev.filter((relationship) => relationship.fromClientId !== clientId && relationship.toClientId !== clientId),
          ...nextRows,
        ]);
        return nextRows;
      },
      [clients]
    );

  // === Mutations: policies ===
  const createPolicy: DataContextValue["createPolicy"] = useCallback(async (input) => {
    const policyId = uid("pol");
    const beneficiaries: Beneficiary[] = input.beneficiaries.map((b) => ({
      ...b,
      id: uid("ben"),
      policyId,
    }));
    const next: Policy = {
      ...input,
      id: policyId,
      lapsedAt: input.status === "lapsed" ? new Date().toISOString() : undefined,
      beneficiaries,
    };
    await persistAction("policy.create", { policy: next });
    setPolicies((prev) => [...prev, next]);
    return next;
  }, []);

  const updatePolicy: DataContextValue["updatePolicy"] = useCallback(
    async (id, patch) => {
      const current = policies.find((p) => p.id === id);
      let updated: Policy | null = null;
      if (current) {
        const nextStatus = patch.status ?? current.status;
        const lapsedAt =
          nextStatus === "lapsed"
            ? current.status === "lapsed" && current.lapsedAt
              ? current.lapsedAt
              : new Date().toISOString()
            : undefined;
        updated = {
          ...current,
          ...patch,
          id: current.id,
          lapsedAt,
          beneficiaries: current.beneficiaries,
        };
        if (patch.beneficiaries) {
          updated.beneficiaries = patch.beneficiaries.map((b) => ({
            ...b,
            id: uid("ben"),
            policyId: id,
          }));
        }
      }
      if (updated) {
        await persistAction("policy.update", { id, patch: updated });
        setPolicies((prev) => prev.map((p) => (p.id === id && updated ? updated : p)));
      }
      return updated;
    },
    [policies]
  );

  const deletePolicy: DataContextValue["deletePolicy"] = useCallback(async (id) => {
    const deleted = policies.some((p) => p.id === id);
    if (deleted) {
      await persistAction("policy.delete", { id });
      setPolicies((prev) => prev.filter((p) => p.id !== id));
    }
    return deleted;
  }, [policies]);

  // === Mutations: follow-ups ===
  const createFollowUp: DataContextValue["createFollowUp"] = useCallback(async (input) => {
    const next: FollowUp = {
      ...input,
      id: uid("fup"),
      createdAt: new Date().toISOString(),
    };
    await persistAction("followup.create", { followUp: next });
    setFollowUps((prev) => [...prev, next]);
    return next;
  }, []);

  const completeFollowUp: DataContextValue["completeFollowUp"] = useCallback(async (id, completedAt) => {
    const doneAt = completedAt ?? new Date().toISOString();
    if (!followUps.some((item) => item.id === id)) return false;
    await persistAction("followup.complete", { id, completedAt: doneAt });
    setFollowUps((prev) =>
      prev.map((followUp) => {
        if (followUp.id !== id) return followUp;
        return { ...followUp, completedAt: doneAt };
      })
    );
    return true;
  }, [followUps]);

  const deleteFollowUp: DataContextValue["deleteFollowUp"] = useCallback(async (id) => {
    const deleted = followUps.some((f) => f.id === id);
    if (deleted) {
      await persistAction("followup.delete", { id });
      setFollowUps((prev) => prev.filter((f) => f.id !== id));
    }
    return deleted;
  }, [followUps]);

  // === Mutations: communication log ===
  //
  // We store email history inline on the Client object (rather than a
  // separate top-level collection) because the spec models it that way and
  // because the only consumer is the per-client detail page. If a future
  // step adds a global "Outbox" view, this will want to be lifted to its
  // own array — but for now keeping the data co-located minimises plumbing.
  const appendEmailHistory: DataContextValue["appendEmailHistory"] =
    useCallback(async (clientId, entry) => {
      if (!clients.some((c) => c.id === clientId)) return null;
      const saved: EmailHistoryEntry = {
        id: entry.id ?? uid("eml"),
        date: entry.date ?? new Date().toISOString(),
        subject: entry.subject,
        body: entry.body,
        templateLabel: entry.templateLabel,
        policyId: entry.policyId,
        policyNumber: entry.policyNumber,
        policyLabel: entry.policyLabel,
        policyContexts: entry.policyContexts,
        communicationType: entry.communicationType,
        attachments: entry.attachments,
      };
      await persistAction("emailHistory.append", { clientId, entry: saved });
      setClients((prev) =>
        prev.map((c) => {
          if (c.id !== clientId) return c;
          // Bump lastContactedAt at the same time so the "last contacted"
          // signal matches the most recent send across all templates —
          // saves the caller from having to make two separate calls.
          return {
            ...c,
            emailHistory: [...(c.emailHistory ?? []), saved],
            lastContactedAt: saved.date,
          };
        })
      );
      return saved;
    }, [clients]);

  const deleteEmailHistory: DataContextValue["deleteEmailHistory"] =
    useCallback(async (clientId, entryIds) => {
      const ids = Array.from(new Set(entryIds.filter(Boolean)));
      if (ids.length === 0) return 0;
      const removed = (clients.find((client) => client.id === clientId)?.emailHistory ?? [])
        .filter((entry) => ids.includes(entry.id)).length;
      await persistAction("emailHistory.delete", { clientId, entryIds: ids });
      setClients((prev) =>
        prev.map((c) => {
          if (c.id !== clientId) return c;
          const before = c.emailHistory ?? [];
          const removedEntries = before.filter((entry) => ids.includes(entry.id));
          const nextHistory = before.filter((entry) => !ids.includes(entry.id));
          return {
            ...c,
            emailHistory: nextHistory,
            notes: removeCommunicationNoteBlocks(c.notes, removedEntries),
          };
        })
      );
      return removed;
    }, [clients]);

  const updateEmailHistory: DataContextValue["updateEmailHistory"] =
    useCallback(async (clientId, entryId, patch) => {
      const original = clients.find((client) => client.id === clientId)?.emailHistory?.find((entry) => entry.id === entryId);
      if (!original) return null;
      await persistAction("emailHistory.update", { clientId, entryId, patch });
      setClients((prev) =>
        prev.map((c) => {
          if (c.id !== clientId) return c;
          const nextHistory = (c.emailHistory ?? []).map((entry) => {
            if (entry.id !== entryId) return entry;
            const nextEntry: EmailHistoryEntry = {
              ...entry,
              subject: patch.subject ?? entry.subject,
              body: patch.body ?? entry.body,
              templateLabel:
                Object.prototype.hasOwnProperty.call(patch, "templateLabel")
                  ? patch.templateLabel
                  : entry.templateLabel,
              communicationType:
                Object.prototype.hasOwnProperty.call(patch, "communicationType")
                  ? patch.communicationType
                  : entry.communicationType,
              policyId:
                Object.prototype.hasOwnProperty.call(patch, "policyId")
                  ? patch.policyId ?? undefined
                  : entry.policyId,
              policyNumber:
                Object.prototype.hasOwnProperty.call(patch, "policyNumber")
                  ? patch.policyNumber ?? undefined
                  : entry.policyNumber,
              policyLabel:
                Object.prototype.hasOwnProperty.call(patch, "policyLabel")
                  ? patch.policyLabel ?? undefined
                  : entry.policyLabel,
              policyContexts:
                Object.prototype.hasOwnProperty.call(patch, "policyContexts")
                  ? patch.policyContexts ?? undefined
                  : entry.policyContexts,
              attachments:
                Object.prototype.hasOwnProperty.call(patch, "attachments")
                  ? patch.attachments ?? undefined
                  : entry.attachments,
            };
            return nextEntry;
          });
          return { ...c, emailHistory: nextHistory };
        })
      );
      return { ...original, subject: patch.subject ?? original.subject, body: patch.body ?? original.body };
    }, [clients]);

  const recordEmailReminderSend: DataContextValue["recordEmailReminderSend"] =
    useCallback(async (input) => {
      if (!clients.some((client) => client.id === input.clientId)) return null;
      if (emailReminderSends.some((send) => send.dedupeKey === input.dedupeKey)) {
        return null;
      }
      const saved: EmailReminderSend = {
        id: input.id ?? uid("ers"),
        dedupeKey: input.dedupeKey,
        policyId: input.policyId,
        clientId: input.clientId,
        type: input.type,
        stage: input.stage,
        cycleKey: input.cycleKey,
        source: input.source ?? "manual",
        messageId: input.messageId,
        seenAt: input.seenAt,
        sentAt: input.sentAt,
        createdAt: input.createdAt ?? new Date().toISOString(),
      };
      await persistAction("emailReminderSend.record", { reminderSend: saved });
      setEmailReminderSends((prev) => [...prev, saved]);
      return saved;
    }, [clients, emailReminderSends]);

  const markEmailReminderSendsSeen: DataContextValue["markEmailReminderSendsSeen"] =
    useCallback(async (ids, seenAt) => {
      const uniqueIds = Array.from(new Set(ids)).filter(Boolean);
      if (uniqueIds.length === 0) return;
      const stamp = seenAt ?? new Date().toISOString();
      await persistAction("emailReminderSend.markSeen", { ids: uniqueIds, seenAt: stamp });
      setEmailReminderSends((prev) =>
        prev.map((send) =>
          uniqueIds.includes(send.id) && !send.seenAt
            ? { ...send, seenAt: stamp }
            : send
        )
      );
    }, []);

  // === Bulk: snapshot / replaceAll for backup-restore ===

  const getSnapshot: DataContextValue["getSnapshot"] = useCallback(() => {
    return {
      version: 1,
      capturedAt: new Date().toISOString(),
      clients,
      policies,
      followUps,
      relationships,
      emailReminderSends,
    };
  }, [clients, policies, followUps, relationships, emailReminderSends]);

  const replaceAll: DataContextValue["replaceAll"] = useCallback(
    async (snapshot) => {
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
      const nextClients = (snapshot.clients as Client[])
        .filter(
          (c) => !!c && typeof c === "object" && typeof c.id === "string"
        )
        .map((client) => ensureClientSlug(client));
      const nextPolicies = prunePolicyJointReferences(pruneOrphans(
        (snapshot.policies as Policy[]).filter(
          (p) =>
            !!p &&
            typeof p === "object" &&
            typeof p.id === "string" &&
            typeof p.clientId === "string"
        ),
        nextClients
      ), nextClients);
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
      const nextRelationships = pruneRelationships(
        Array.isArray(snapshot.relationships)
          ? (snapshot.relationships as ClientRelationship[]).filter(
              (r) =>
                !!r &&
                typeof r === "object" &&
                typeof r.id === "string" &&
                typeof r.fromClientId === "string" &&
                typeof r.toClientId === "string"
            )
          : [],
        nextClients
      );
      const nextEmailReminderSends = Array.isArray(snapshot.emailReminderSends)
        ? (snapshot.emailReminderSends as EmailReminderSend[]).filter(
            (send) =>
              !!send &&
              typeof send === "object" &&
              typeof send.id === "string" &&
              typeof send.dedupeKey === "string" &&
              typeof send.clientId === "string" &&
              nextClients.some((client) => client.id === send.clientId) &&
              (!send.policyId || nextPolicies.some((policy) => policy.id === send.policyId))
          )
        : [];
      const restoredSnapshot = {
        version: 1,
        capturedAt: new Date().toISOString(),
        clients: nextClients,
        policies: nextPolicies,
        followUps: nextFollowUps,
        relationships: nextRelationships,
        emailReminderSends: nextEmailReminderSends,
        emailDeliveryTasks: snapshot.emailDeliveryTasks,
      };

      try {
        // A restore is destructive. Unlike ordinary optimistic edits, it must
        // finish on the server before the app is allowed to reload.
        await persistAction("data.replaceAll", { snapshot: restoredSnapshot });
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Could not save restored data",
        };
      }

      setClients(nextClients);
      setPolicies(nextPolicies);
      setFollowUps(nextFollowUps);
      setRelationships(nextRelationships);
      setEmailReminderSends(nextEmailReminderSends);
      return { ok: true };
    },
    []
  );

  const value = useMemo<DataContextValue>(
    () => ({
      clients,
      policies,
      followUps,
      relationships,
      emailReminderSends,
      dataStatus,
      dataError,
      reloadData,
      getClient,
      getClientBySlug,
      resolveClientParam,
      getClientWithStats,
      listClientsWithStats,
      getPolicy,
      getPoliciesByClient,
      getFollowUpsByClient,
      getClientRelationships,
      createClientAsync,
      updateClientAsync,
      deleteClient,
      replaceClientRelationshipsAsync,
      createPolicy,
      updatePolicy,
      deletePolicy,
      createFollowUp,
      completeFollowUp,
      deleteFollowUp,
      appendEmailHistory,
      updateEmailHistory,
      deleteEmailHistory,
      recordEmailReminderSend,
      markEmailReminderSendsSeen,
      getSnapshot,
      replaceAll,
    }),
    [
      clients,
      policies,
      followUps,
      relationships,
      emailReminderSends,
      dataStatus,
      dataError,
      reloadData,
      getClient,
      getClientBySlug,
      resolveClientParam,
      getClientWithStats,
      listClientsWithStats,
      getPolicy,
      getPoliciesByClient,
      getFollowUpsByClient,
      getClientRelationships,
      createClientAsync,
      updateClientAsync,
      deleteClient,
      replaceClientRelationshipsAsync,
      createPolicy,
      updatePolicy,
      deletePolicy,
      createFollowUp,
      completeFollowUp,
      deleteFollowUp,
      appendEmailHistory,
      updateEmailHistory,
      deleteEmailHistory,
      recordEmailReminderSend,
      markEmailReminderSendsSeen,
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
