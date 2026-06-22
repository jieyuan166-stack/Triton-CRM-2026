// components/providers/DataProvider.tsx
// Client-side facade over the Prisma-backed data API.
// The public API stays synchronous for existing components; mutations update
// local React state immediately, then persist the same generated IDs to /api/data.
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
import { toast } from "sonner";
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
  createClient(input: Omit<Client, "id" | "createdAt">): Client;
  updateClient(id: string, patch: Partial<Omit<Client, "id">>): Client | null;
  updateClientAsync(id: string, patch: Partial<Omit<Client, "id">>): Promise<Client | null>;
  deleteClient(id: string): boolean;
  replaceClientRelationships(
    clientId: string,
    input: Array<{ toClientId: string; relationship: ClientRelationship["relationship"] }>
  ): ClientRelationship[];
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
  completeFollowUp(id: string, completedAt?: string): boolean;
  deleteFollowUp(id: string): boolean;

  recordEmailReminderSend(input: Omit<EmailReminderSend, "id" | "createdAt"> & Partial<Pick<EmailReminderSend, "id" | "createdAt">>): EmailReminderSend | null;
  markEmailReminderSendsSeen(ids: string[], seenAt?: string): void;

  // mutations — communication log
  /** Append a sent-email record to the given client's history. Generates
   *  the entry id if the caller doesn't supply one. Returns the saved
   *  entry, or null if the client doesn't exist. */
  appendEmailHistory(
    clientId: string,
    entry: Omit<EmailHistoryEntry, "id" | "date"> &
      Partial<Pick<EmailHistoryEntry, "id" | "date">>
  ): EmailHistoryEntry | null;
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
  ): EmailHistoryEntry | null;
  /** Delete one or more sent-email history entries for a client. Returns
   *  the number removed from local state. */
  deleteEmailHistory(clientId: string, entryIds: string[]): number;

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
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error || `Persist failed (${res.status})`);
  }
}

function persistInBackground(
  action: string,
  payload: Record<string, unknown>,
  options: { silent?: boolean } = {}
) {
  void persistAction(action, payload).catch((error) => {
    console.error(`[DataProvider] ${action} failed`, error);
    if (options.silent) return;
    toast.error("Could not save change", {
      description:
        error instanceof Error
          ? `${action}: ${error.message}`
          : "Please refresh and try again.",
    });
  });
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
  const createClient: DataContextValue["createClient"] = useCallback(
    (input) => {
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
      setClients((prev) => [...prev, next]);
      persistInBackground("client.create", { client: next });
      return next;
    },
    [clients]
  );

  const updateClient: DataContextValue["updateClient"] = useCallback(
    (id, patch) => {
      const prepared = buildClientUpdate(id, patch, clients);
      const updated = prepared?.updated ?? null;
      setClients((prev) =>
        prev.map((c) => (c.id === id && updated ? updated : c))
      );
      if (prepared) {
        persistInBackground(
          "client.update",
          {
            id,
            patch: prepared.patch,
          },
          { silent: Object.keys(patch).length === 1 && patch.slug !== undefined }
        );
      }
      return updated;
    },
    [clients]
  );

  const updateClientAsync: DataContextValue["updateClientAsync"] = useCallback(
    async (id, patch) => {
      const prepared = buildClientUpdate(id, patch, clients);
      if (!prepared) return null;
      const previous = clients;
      setClients((prev) =>
        prev.map((c) => (c.id === id ? prepared.updated : c))
      );
      try {
        await persistAction("client.update", { id, patch: prepared.patch });
        return prepared.updated;
      } catch (error) {
        setClients(previous);
        throw error;
      }
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
    (id) => {
      const existed = clients.some((c) => c.id === id);
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
      if (existed) {
        persistInBackground("client.delete", { id });
      }
      return existed;
    },
    [clients]
  );

  const replaceClientRelationships: DataContextValue["replaceClientRelationships"] =
    useCallback(
      (clientId, input) => {
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

        setRelationships((prev) => [
          ...prev.filter(
            (relationship) =>
              relationship.fromClientId !== clientId &&
              relationship.toClientId !== clientId
          ),
          ...nextRows,
        ]);
        persistInBackground("clientRelationships.replace", {
          clientId,
          relationships: nextRows,
        });
        return nextRows;
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
        const previous = relationships;
        setRelationships((prev) => [
          ...prev.filter(
            (relationship) =>
              relationship.fromClientId !== clientId &&
              relationship.toClientId !== clientId
          ),
          ...nextRows,
        ]);
        try {
          await persistAction("clientRelationships.replace", {
            clientId,
            relationships: nextRows,
          });
          return nextRows;
        } catch (error) {
          setRelationships(previous);
          throw error;
        }
      },
      [clients, relationships]
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
    persistInBackground("policy.create", { policy: next });
    return next;
  }, []);

  const updatePolicy: DataContextValue["updatePolicy"] = useCallback(
    (id, patch) => {
      const current = policies.find((p) => p.id === id);
      let updated: Policy | null = null;
      if (current) {
        updated = { ...current, ...patch, id: current.id, beneficiaries: current.beneficiaries };
        if (patch.beneficiaries) {
          updated.beneficiaries = patch.beneficiaries.map((b) => ({
            ...b,
            id: uid("ben"),
            policyId: id,
          }));
        }
      }
      setPolicies((prev) => prev.map((p) => (p.id === id && updated ? updated : p)));
      if (updated) {
        persistInBackground("policy.update", { id, patch: updated });
      }
      return updated;
    },
    [policies]
  );

  const deletePolicy: DataContextValue["deletePolicy"] = useCallback((id) => {
    const deleted = policies.some((p) => p.id === id);
    setPolicies((prev) => prev.filter((p) => p.id !== id));
    if (deleted) {
      persistInBackground("policy.delete", { id });
    }
    return deleted;
  }, [policies]);

  // === Mutations: follow-ups ===
  const createFollowUp: DataContextValue["createFollowUp"] = useCallback((input) => {
    const next: FollowUp = {
      ...input,
      id: uid("fup"),
      createdAt: new Date().toISOString(),
    };
    setFollowUps((prev) => [...prev, next]);
    persistInBackground("followup.create", { followUp: next });
    return next;
  }, []);

  const completeFollowUp: DataContextValue["completeFollowUp"] = useCallback((id, completedAt) => {
    const doneAt = completedAt ?? new Date().toISOString();
    let updated = false;
    setFollowUps((prev) =>
      prev.map((followUp) => {
        if (followUp.id !== id) return followUp;
        updated = true;
        return { ...followUp, completedAt: doneAt };
      })
    );
    if (updated) {
      persistInBackground("followup.complete", { id, completedAt: doneAt });
    }
    return updated;
  }, []);

  const deleteFollowUp: DataContextValue["deleteFollowUp"] = useCallback((id) => {
    const deleted = followUps.some((f) => f.id === id);
    setFollowUps((prev) => prev.filter((f) => f.id !== id));
    if (deleted) {
      persistInBackground("followup.delete", { id });
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
    useCallback((clientId, entry) => {
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
      persistInBackground("emailHistory.append", { clientId, entry: saved });
      return saved;
    }, [clients]);

  const deleteEmailHistory: DataContextValue["deleteEmailHistory"] =
    useCallback((clientId, entryIds) => {
      const ids = Array.from(new Set(entryIds.filter(Boolean)));
      if (ids.length === 0) return 0;
      let removed = 0;
      setClients((prev) =>
        prev.map((c) => {
          if (c.id !== clientId) return c;
          const before = c.emailHistory ?? [];
          const removedEntries = before.filter((entry) => ids.includes(entry.id));
          const nextHistory = before.filter((entry) => !ids.includes(entry.id));
          removed = before.length - nextHistory.length;
          return {
            ...c,
            emailHistory: nextHistory,
            notes: removeCommunicationNoteBlocks(c.notes, removedEntries),
          };
        })
      );
      persistInBackground("emailHistory.delete", { clientId, entryIds: ids });
      return removed;
    }, []);

  const updateEmailHistory: DataContextValue["updateEmailHistory"] =
    useCallback((clientId, entryId, patch) => {
      let updated: EmailHistoryEntry | null = null;
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
            updated = nextEntry;
            return nextEntry;
          });
          return { ...c, emailHistory: nextHistory };
        })
      );
      if (updated) {
        persistInBackground("emailHistory.update", { clientId, entryId, patch });
      }
      return updated;
    }, []);

  const recordEmailReminderSend: DataContextValue["recordEmailReminderSend"] =
    useCallback((input) => {
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
      setEmailReminderSends((prev) => [...prev, saved]);
      persistInBackground("emailReminderSend.record", { reminderSend: saved });
      return saved;
    }, [clients, emailReminderSends]);

  const markEmailReminderSendsSeen: DataContextValue["markEmailReminderSendsSeen"] =
    useCallback((ids, seenAt) => {
      const uniqueIds = Array.from(new Set(ids)).filter(Boolean);
      if (uniqueIds.length === 0) return;
      const stamp = seenAt ?? new Date().toISOString();
      setEmailReminderSends((prev) =>
        prev.map((send) =>
          uniqueIds.includes(send.id) && !send.seenAt
            ? { ...send, seenAt: stamp }
            : send
        )
      );
      persistInBackground("emailReminderSend.markSeen", { ids: uniqueIds, seenAt: stamp });
    }, []);

  const markRenewalEmailSent: DataContextValue["markRenewalEmailSent"] =
    useCallback((policyId, at) => {
      const stamp = at ?? new Date().toISOString();
      setPolicies((prev) =>
        prev.map((p) =>
          p.id === policyId ? { ...p, lastRenewalEmailAt: stamp } : p
        )
      );
      persistInBackground("policy.markRenewalEmailSent", { policyId, at: stamp });
    }, []);

  const markBirthdayEmailSent: DataContextValue["markBirthdayEmailSent"] =
    useCallback((clientId, at) => {
      const stamp = at ?? new Date().toISOString();
      setClients((prev) =>
        prev.map((c) =>
          c.id === clientId ? { ...c, lastBirthdayEmailAt: stamp } : c
        )
      );
      persistInBackground("client.markBirthdayEmailSent", { clientId, at: stamp });
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
      persistInBackground("client.prependNote", { clientId, block });
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
      relationships,
      emailReminderSends,
    };
  }, [clients, policies, followUps, relationships, emailReminderSends]);

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
      setClients(nextClients);
      setPolicies(nextPolicies);
      setFollowUps(nextFollowUps);
      setRelationships(nextRelationships);
      setEmailReminderSends(nextEmailReminderSends);
      persistInBackground("data.replaceAll", {
        snapshot: {
          version: 1,
          capturedAt: new Date().toISOString(),
          clients: nextClients,
          policies: nextPolicies,
          followUps: nextFollowUps,
          relationships: nextRelationships,
          emailReminderSends: nextEmailReminderSends,
        },
      });
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
      getClient,
      getClientBySlug,
      resolveClientParam,
      getClientWithStats,
      listClientsWithStats,
      getPolicy,
      getPoliciesByClient,
      getFollowUpsByClient,
      getClientRelationships,
      createClient,
      updateClient,
      updateClientAsync,
      deleteClient,
      replaceClientRelationships,
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
      relationships,
      emailReminderSends,
      dataStatus,
      dataError,
      getClient,
      getClientBySlug,
      resolveClientParam,
      getClientWithStats,
      listClientsWithStats,
      getPolicy,
      getPoliciesByClient,
      getFollowUpsByClient,
      getClientRelationships,
      createClient,
      updateClient,
      updateClientAsync,
      deleteClient,
      replaceClientRelationships,
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
