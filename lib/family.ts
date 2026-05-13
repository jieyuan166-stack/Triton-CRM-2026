import type {
  Client,
  ClientRelationship,
  Policy,
} from "@/lib/types";
import type { RelationshipType } from "@/lib/constants";
import {
  calculatePortfolioMetrics,
  dedupePolicies,
  getPolicyPortfolioAmount,
} from "@/lib/portfolio-metrics";

export interface VisibleFamilyLink {
  relationshipId: string;
  client: Client;
  relationship: RelationshipType | "Linked";
  source: "outgoing" | "incoming";
}

export interface FamilySummary {
  linkedClients: VisibleFamilyLink[];
  memberIds: Set<string>;
  policies: Array<Policy & { owner: Client }>;
  totalAum: number;
  insuranceFaceAmount: number;
  investmentAum: number;
  categoryTotals: Array<{ category: string; total: number }>;
  carrierTotals: Array<{ carrier: Policy["carrier"]; total: number }>;
}

export function inverseRelationship(
  relationship?: RelationshipType | string
): RelationshipType | "Linked" {
  if (relationship === "Parent") return "Child";
  if (relationship === "Child") return "Parent";
  if (
    relationship === "Spouse" ||
    relationship === "Sibling" ||
    relationship === "Beneficiary" ||
    relationship === "Trustee" ||
    relationship === "Business Associate"
  ) {
    return relationship;
  }
  return "Linked";
}

export function getVisibleFamilyLinks(
  clientId: string,
  clients: Client[],
  relationships: ClientRelationship[]
): VisibleFamilyLink[] {
  return relationships
    .flatMap((relationship): VisibleFamilyLink[] => {
      if (relationship.fromClientId === clientId) {
        const linked = clients.find((client) => client.id === relationship.toClientId);
        if (!linked) return [];
        return [{
          relationshipId: relationship.id,
          client: linked,
          relationship: relationship.relationship,
          source: "outgoing",
        }];
      }

      if (relationship.toClientId === clientId) {
        const linked = clients.find((client) => client.id === relationship.fromClientId);
        if (!linked) return [];
        return [{
          relationshipId: relationship.id,
          client: linked,
          relationship: inverseRelationship(relationship.relationship),
          source: "incoming",
        }];
      }

      return [];
    })
    .sort((a, b) =>
      `${a.client.lastName} ${a.client.firstName}`.localeCompare(
        `${b.client.lastName} ${b.client.firstName}`
      )
    );
}

export function buildFamilySummary(
  currentClient: Client,
  clients: Client[],
  policies: Policy[],
  relationships: ClientRelationship[]
): FamilySummary {
  const linkedClients = getVisibleFamilyLinks(
    currentClient.id,
    clients,
    relationships
  );
  const memberIds = new Set([
    currentClient.id,
    ...linkedClients.map((link) => link.client.id),
  ]);
  const clientById = new Map(clients.map((client) => [client.id, client]));

  const familyPolicies = dedupePolicies(
    policies.filter(
      (policy) =>
        memberIds.has(policy.clientId) ||
        (!!policy.isJoint &&
          !!policy.jointWithClientId &&
          memberIds.has(policy.jointWithClientId))
    )
  )
    .flatMap((policy) => {
      const owner = clientById.get(policy.clientId);
      return owner ? [{ ...policy, owner }] : [];
    })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      return `${a.owner.lastName} ${a.carrier}`.localeCompare(
        `${b.owner.lastName} ${b.carrier}`
      );
    });

  const activePolicies = familyPolicies.filter((policy) => policy.status === "active");
  const metrics = calculatePortfolioMetrics(activePolicies);
  const totalAum = metrics.insuranceFaceAmount + metrics.investmentAum;

  const categoryTotals = Array.from(
    activePolicies.reduce((map, policy) => {
      map.set(
        policy.category,
        (map.get(policy.category) ?? 0) + getPolicyPortfolioAmount(policy)
      );
      return map;
    }, new Map<string, number>())
  )
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

  const carrierTotals = Array.from(
    activePolicies.reduce((map, policy) => {
      map.set(
        policy.carrier,
        (map.get(policy.carrier) ?? 0) + getPolicyPortfolioAmount(policy)
      );
      return map;
    }, new Map<Policy["carrier"], number>())
  )
    .map(([carrier, total]) => ({ carrier, total }))
    .sort((a, b) => b.total - a.total);

  return {
    linkedClients,
    memberIds,
    policies: familyPolicies,
    totalAum,
    insuranceFaceAmount: metrics.insuranceFaceAmount,
    investmentAum: metrics.investmentAum,
    categoryTotals,
    carrierTotals,
  };
}
