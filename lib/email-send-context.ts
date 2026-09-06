import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { birthdayCycle } from "@/lib/automation-calendar";
import { daysUntil } from "@/lib/date-utils";
import { getPremiumReminderStage, premiumReminderDedupeKey, resolvePremiumReminderDate } from "@/lib/premium-reminders";

export const sendContextSchema = z.object({
  template: z.enum(["custom", "renewal", "birthday", "festival"]).default("custom"),
  body: z.string().max(500_000),
  policyIds: z.array(z.string().min(1)).max(100).default([]),
  communicationType: z.string().max(200).optional(),
  saveToActivity: z.boolean().default(true),
  resend: z.boolean().default(false),
  reminderDedupeKey: z.string().max(500).optional(),
  draftEntryId: z.string().optional(),
  attachments: z.array(z.object({ filename: z.string().max(255), contentType: z.string().max(100), size: z.number().int().nonnegative().max(20 * 1024 * 1024) })).max(10).default([]),
});

export async function resolveEmailContext(userId: string, clientId: string | undefined, input: z.infer<typeof sendContextSchema>, now = new Date()) {
  const client = clientId ? await db.client.findFirst({ where: { id: clientId, userId } }) : null;
  if (clientId && !client) throw new Error("Email context not found");
  const ids = [...new Set(input.policyIds)];
  const policies = await db.policy.findMany({
    where: {
      userId,
      id: { in: ids },
      ...(clientId
        ? {
            OR: [
              { clientId },
              { jointWithClientId: clientId },
              { policyOwnerClientId: clientId },
              { policyOwner2ClientId: clientId },
            ],
          }
        : {}),
    },
  });
  if (policies.length !== ids.length) throw new Error("Email context not found");
  // Preserve the selection order: Renewal uses the first selected policy.
  const contexts = ids.map((id) => {
    const policy = policies.find((item) => item.id === id)!;
    return { policyId: id, policyNumber: policy.policyNumber, policyLabel: `${policy.carrier} ${policy.productName || policy.productType}` };
  });
  if (input.draftEntryId && !await db.emailHistory.findFirst({ where: { id: input.draftEntryId, clientId, client: { userId }, templateLabel: { startsWith: "Email Draft" } } })) throw new Error("Email draft not found");
  let reminder: { type: string; policyId?: string; clientId: string; cycleKey: string; stage?: "first" | "second"; dedupeKey: string } | undefined;
  const policy = policies.find((item) => item.id === ids[0]);
  if (client && input.template === "renewal" && policy?.premiumDate && policy.status === "active" && policy.category === "Insurance") {
    const dueDate = resolvePremiumReminderDate(policy.premiumDate, now);
    const stage = getPremiumReminderStage(daysUntil(dueDate, now));
    const cycleKey = `${policy.id}:${dueDate}`;
    if (stage) reminder = { type: "premium", policyId: policy.id, clientId: client.id, cycleKey, stage, dedupeKey: premiumReminderDedupeKey({ policyId: policy.id, clientId: client.id, cycleKey, stage }) };
  }
  if (client && input.template === "birthday") {
    const local = birthdayCycle(client.birthday, client.province, now);
    if (local) {
      const cycleKey = `${client.id}:${local.year}`;
      reminder = { type: "birthday", clientId: client.id, cycleKey, dedupeKey: `birthday:${client.id}:${cycleKey}` };
    }
  }
  if (client && input.resend && input.reminderDedupeKey) {
    const prior = await db.emailReminderSend.findFirst({ where: { dedupeKey: input.reminderDedupeKey, clientId: client.id, client: { userId } } });
    if (!prior || (prior.policyId && prior.policyId !== policy?.id)) throw new Error("Reminder not found");
    reminder = { clientId: client.id, policyId: prior.policyId ?? undefined, type: prior.type,
      cycleKey: prior.cycleKey, stage: prior.stage as "first" | "second" | undefined, dedupeKey: prior.dedupeKey };
  }
  return { client, contexts, reminder };
}
