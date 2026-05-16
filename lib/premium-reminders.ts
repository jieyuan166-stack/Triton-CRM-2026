import {
  daysUntil,
  formatDate,
  resolveRecurringDate,
} from "@/lib/date-utils";
import type { Client, Policy } from "@/lib/types";

export const PREMIUM_REMINDER_WINDOW_DAYS = 30;
export const RENEWAL_COMPLETED_DAYS = 30;

export type PremiumReminderRecipientRow = {
  id: string;
  policy: Policy;
  clientId: string;
  dueDate: string;
  dueInDays: number;
  isJointRecipient: boolean;
};

export type PremiumReminderCompletedRow = {
  id: string;
  policy: Policy;
  clientId: string;
  dueDate: string;
  dueInDays: number;
  completedAt: string;
};

export type PremiumReminderState = {
  duePolicies: Policy[];
  pendingPolicies: Policy[];
  completedPolicies: Policy[];
  pendingRows: PremiumReminderRecipientRow[];
  completedRows: PremiumReminderCompletedRow[];
  duePremiumAmount: number;
  pendingPremiumAmount: number;
  completedPremiumAmount: number;
};

export function resolvePremiumReminderDate(
  input: string,
  today = new Date()
): string {
  return resolveRecurringDate(input, today);
}

function isRenewalCompleted(policy: Policy, now: number): boolean {
  if (!policy.lastRenewalEmailAt) return false;
  const sentAt = new Date(policy.lastRenewalEmailAt).getTime();
  if (Number.isNaN(sentAt)) return false;
  const sinceDays = (now - sentAt) / (1000 * 60 * 60 * 24);
  return sinceDays >= 0 && sinceDays < RENEWAL_COMPLETED_DAYS;
}

function buildRecipientRows(
  policy: Policy,
  clients: Client[],
  dueDate: string,
  dueInDays: number
): PremiumReminderRecipientRow[] {
  const rows: PremiumReminderRecipientRow[] = [
    {
      id: `${policy.id}:${policy.clientId}`,
      policy,
      clientId: policy.clientId,
      dueDate,
      dueInDays,
      isJointRecipient: false,
    },
  ];

  if (
    policy.isJoint &&
    policy.jointWithClientId &&
    policy.jointWithClientId !== policy.clientId &&
    clients.some((client) => client.id === policy.jointWithClientId)
  ) {
    rows.push({
      id: `${policy.id}:${policy.jointWithClientId}`,
      policy,
      clientId: policy.jointWithClientId,
      dueDate,
      dueInDays,
      isJointRecipient: true,
    });
  }

  return rows;
}

export function buildPremiumReminderState({
  policies,
  clients = [],
  today = new Date(),
  windowDays = PREMIUM_REMINDER_WINDOW_DAYS,
}: {
  policies: Policy[];
  clients?: Client[];
  today?: Date;
  windowDays?: number;
}): PremiumReminderState {
  const now = today.getTime();
  const rows = policies
    .filter(
      (policy) =>
        policy.status === "active" &&
        policy.category === "Insurance" &&
        !!policy.premiumDate
    )
    .map((policy) => {
      const dueDate = resolvePremiumReminderDate(policy.premiumDate!, today);
      const dueInDays = daysUntil(dueDate, today);
      return { policy, dueDate, dueInDays };
    })
    .filter((row) => row.dueInDays >= 0 && row.dueInDays <= windowDays)
    .sort((a, b) => {
      if (a.dueDate === b.dueDate) {
        return (a.policy.policyNumber || a.policy.id).localeCompare(
          b.policy.policyNumber || b.policy.id
        );
      }
      return a.dueDate.localeCompare(b.dueDate);
    });

  const pendingRows: PremiumReminderRecipientRow[] = [];
  const completedRows: PremiumReminderCompletedRow[] = [];
  const pendingPolicies: Policy[] = [];
  const completedPolicies: Policy[] = [];

  for (const row of rows) {
    if (isRenewalCompleted(row.policy, now)) {
      completedPolicies.push(row.policy);
      completedRows.push({
        id: row.policy.id,
        policy: row.policy,
        clientId: row.policy.clientId,
        dueDate: row.dueDate,
        dueInDays: row.dueInDays,
        completedAt: row.policy.lastRenewalEmailAt!,
      });
    } else {
      pendingPolicies.push(row.policy);
      pendingRows.push(
        ...buildRecipientRows(row.policy, clients, row.dueDate, row.dueInDays)
      );
    }
  }

  return {
    duePolicies: rows.map((row) => row.policy),
    pendingPolicies,
    completedPolicies,
    pendingRows,
    completedRows,
    duePremiumAmount: rows.reduce(
      (sum, row) => sum + (row.policy.premium || 0),
      0
    ),
    pendingPremiumAmount: pendingPolicies.reduce(
      (sum, policy) => sum + (policy.premium || 0),
      0
    ),
    completedPremiumAmount: completedPolicies.reduce(
      (sum, policy) => sum + (policy.premium || 0),
      0
    ),
  };
}

export function formatPremiumDueDate(input: string): string {
  return formatDate(input);
}
