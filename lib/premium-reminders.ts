import {
  daysUntil,
  formatDate,
  resolveRecurringDate,
} from "@/lib/date-utils";
import type { Client, EmailReminderSend, EmailReminderStage, Policy } from "@/lib/types";

export const PREMIUM_REMINDER_WINDOW_DAYS = 30;

export type PremiumReminderRecipientRow = {
  id: string;
  policy: Policy;
  clientId: string;
  dueDate: string;
  dueInDays: number;
  isJointRecipient: boolean;
  stage: EmailReminderStage;
  stageLabel: string;
  cycleKey: string;
  dedupeKey: string;
};

export type PremiumReminderCompletedRow = PremiumReminderRecipientRow & {
  completedAt: string;
  reminderSend?: EmailReminderSend;
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

export function getPremiumReminderStage(dueInDays: number): EmailReminderStage | null {
  if (dueInDays >= 16 && dueInDays <= 30) return "first";
  if (dueInDays >= 0 && dueInDays <= 15) return "second";
  return null;
}

export function premiumReminderStageLabel(stage: EmailReminderStage): string {
  return stage === "first" ? "First Reminder" : "Second Reminder";
}

export function premiumReminderCycleKey(policy: Policy, dueDate: string): string {
  return `${policy.id}:${dueDate}`;
}

export function premiumReminderDedupeKey(input: {
  policyId: string;
  clientId: string;
  cycleKey: string;
  stage: EmailReminderStage;
}): string {
  return `premium:${input.policyId}:${input.clientId}:${input.cycleKey}:${input.stage}`;
}

function buildRecipientRows(
  policy: Policy,
  clients: Client[],
  dueDate: string,
  dueInDays: number,
  stage: EmailReminderStage
): PremiumReminderRecipientRow[] {
  const cycleKey = premiumReminderCycleKey(policy, dueDate);
  const rows: PremiumReminderRecipientRow[] = [
    {
      id: `${policy.id}:${policy.clientId}:${stage}`,
      policy,
      clientId: policy.clientId,
      dueDate,
      dueInDays,
      isJointRecipient: false,
      stage,
      stageLabel: premiumReminderStageLabel(stage),
      cycleKey,
      dedupeKey: premiumReminderDedupeKey({
        policyId: policy.id,
        clientId: policy.clientId,
        cycleKey,
        stage,
      }),
    },
  ];

  if (
    policy.isJoint &&
    policy.jointWithClientId &&
    policy.jointWithClientId !== policy.clientId &&
    clients.some((client) => client.id === policy.jointWithClientId)
  ) {
    rows.push({
      id: `${policy.id}:${policy.jointWithClientId}:${stage}`,
      policy,
      clientId: policy.jointWithClientId,
      dueDate,
      dueInDays,
      isJointRecipient: true,
      stage,
      stageLabel: premiumReminderStageLabel(stage),
      cycleKey,
      dedupeKey: premiumReminderDedupeKey({
        policyId: policy.id,
        clientId: policy.jointWithClientId,
        cycleKey,
        stage,
      }),
    });
  }

  return rows;
}

export function buildPremiumReminderState({
  policies,
  clients = [],
  emailReminderSends = [],
  today = new Date(),
  windowDays = PREMIUM_REMINDER_WINDOW_DAYS,
}: {
  policies: Policy[];
  clients?: Client[];
  emailReminderSends?: EmailReminderSend[];
  today?: Date;
  windowDays?: number;
}): PremiumReminderState {
  const sentByKey = new Map(
    emailReminderSends
      .filter((send) => send.type === "premium")
      .map((send) => [send.dedupeKey, send])
  );

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
      const stage = getPremiumReminderStage(dueInDays);
      return { policy, dueDate, dueInDays, stage };
    })
    .filter((row) => row.dueInDays >= 0 && row.dueInDays <= windowDays && row.stage)
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

  for (const row of rows) {
    const recipientRows = buildRecipientRows(
      row.policy,
      clients,
      row.dueDate,
      row.dueInDays,
      row.stage!
    );
    for (const recipientRow of recipientRows) {
      const sent = sentByKey.get(recipientRow.dedupeKey);
      if (sent) {
        completedRows.push({
          ...recipientRow,
          completedAt: sent.sentAt,
          reminderSend: sent,
        });
      } else {
        pendingRows.push(recipientRow);
      }
    }
  }

  const pendingPolicyIds = new Set(pendingRows.map((row) => row.policy.id));
  const completedPolicyIds = new Set(completedRows.map((row) => row.policy.id));
  const duePolicies = rows.map((row) => row.policy);

  return {
    duePolicies,
    pendingPolicies: duePolicies.filter((policy) => pendingPolicyIds.has(policy.id)),
    completedPolicies: duePolicies.filter((policy) => completedPolicyIds.has(policy.id)),
    pendingRows,
    completedRows,
    duePremiumAmount: duePolicies.reduce((sum, policy) => sum + (policy.premium || 0), 0),
    pendingPremiumAmount: Array.from(pendingPolicyIds).reduce((sum, id) => {
      const policy = duePolicies.find((item) => item.id === id);
      return sum + (policy?.premium || 0);
    }, 0),
    completedPremiumAmount: Array.from(completedPolicyIds).reduce((sum, id) => {
      const policy = duePolicies.find((item) => item.id === id);
      return sum + (policy?.premium || 0);
    }, 0),
  };
}

export function formatPremiumDueDate(input: string): string {
  return formatDate(input);
}
