import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isDefinitelyUnsent } from "@/lib/automation-calendar";
import { z } from "zod";

const guardSchema = z.object({
  userId: z.string(), dedupeKey: z.string().min(1).max(500), type: z.string().max(50), cycleKey: z.string().max(500),
  clientId: z.string().nullish(), policyId: z.string().nullish(), stage: z.string().nullish(),
  status: z.enum(["sending", "sent", "failed", "review"]), startedAt: z.coerce.date(), finishedAt: z.coerce.date().nullable(),
  messageId: z.string().nullish(), errorCode: z.string().nullish(), attempts: z.number().int().positive(),
});

export async function restoreDeliveryGuards(tx: Prisma.TransactionClient, raw: unknown[], userId: string) {
  for (const value of raw) {
    const guard = guardSchema.parse(value);
    if (guard.userId !== userId) throw new Error("Invalid delivery snapshot owner");
    const existing = await tx.emailDeliveryTask.findUnique({ where: { dedupeKey: guard.dedupeKey } });
    if (existing && existing.userId !== userId) throw new Error("Invalid delivery owner");
    // Restoring an older snapshot must not erase newer delivery reservations.
    if (!existing) await tx.emailDeliveryTask.create({ data: guard });
  }
}

export type DeliveryIdentity = {
  userId: string; dedupeKey: string; type: string; cycleKey: string;
  clientId?: string; policyId?: string; stage?: string;
};
export type DeliveryResult = { status: "sent" | "skipped" | "failed" | "review"; reason?: string; messageId?: string };

// Unique claims happen before SMTP. A crashed/uncertain send is never retried automatically.
export async function deliverOnce(
  identity: DeliveryIdentity,
  send: () => Promise<{ messageId: string }>,
  complete: (tx: Prisma.TransactionClient, messageId: string) => Promise<void>,
): Promise<DeliveryResult> {
  let task;
  try {
    task = await db.emailDeliveryTask.create({ data: identity });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const previous = await db.emailDeliveryTask.findUnique({ where: { dedupeKey: identity.dedupeKey } });
    if (!previous || previous.userId !== identity.userId) throw new Error("Invalid delivery owner");
    if (previous.status !== "failed" || Date.now() - previous.startedAt.getTime() < 15 * 60_000) {
      return { status: "skipped", messageId: previous.status === "sent" ? previous.messageId ?? undefined : undefined, reason: previous.status === "sent" ? "Already sent" : "Delivery reserved or needs review" };
    }
    const claimed = await db.emailDeliveryTask.updateMany({
      where: { id: previous.id, status: "failed", attempts: previous.attempts },
      data: { status: "sending", startedAt: new Date(), finishedAt: null, errorCode: null, attempts: { increment: 1 } },
    });
    if (!claimed.count) return { status: "skipped", reason: "Delivery reserved" };
    task = previous;
  }
  let accepted = false;
  let messageId: string | undefined;
  try {
    const info = await send();
    accepted = true;
    messageId = info.messageId;
    await db.$transaction(async (tx) => {
      await complete(tx, info.messageId);
      await tx.emailDeliveryTask.update({ where: { id: task.id }, data: {
        status: "sent", messageId: info.messageId, finishedAt: new Date(), errorCode: null,
      } });
    }, { timeout: 20_000 });
    return { status: "sent", messageId };
  } catch (error) {
    const status = !accepted && isDefinitelyUnsent(error) ? "failed" : "review";
    const reason = status === "failed" ? "SMTP rejected the message; retry scheduled" : "Delivery uncertain; check Sent before sending again";
    await db.emailDeliveryTask.update({ where: { id: task.id }, data: {
      status, messageId, errorCode: accepted ? "LOG_COMMIT_FAILED" : status === "failed" ? "SMTP_REJECTED" : "SMTP_UNCERTAIN", finishedAt: new Date(),
    } }).catch(() => { /* The durable sending claim still blocks a duplicate. */ });
    console.error("[email-delivery]", { taskId: task.id, status, accepted });
    return { status, reason, messageId };
  }
}

export async function runForAdvisor(userId: string, kind: string, work: (record: (result: DeliveryResult) => void) => Promise<void>) {
  const startedAt = new Date();
  const totals = { sent: 0, skipped: 0, failed: 0, review: 0 };
  const reasons: Record<string, number> = {};
  const record = (result: DeliveryResult) => {
    totals[result.status]++;
    if (result.reason) reasons[result.reason] = (reasons[result.reason] ?? 0) + 1;
  };
  try { await work(record); }
  catch { record({ status: "failed", reason: "Advisor configuration or task failed" }); }
  try {
    const state = { startedAt, finishedAt: new Date(), ...totals, reasons: JSON.stringify(reasons) };
    await db.automationRun.upsert({ where: { userId_kind: { userId, kind } },
      create: { userId, kind, ...state, lastSuccessAt: totals.sent ? new Date() : null },
      update: { ...state, ...(totals.sent ? { lastSuccessAt: new Date() } : {}) },
    });
  } catch { totals.failed++; }
  return totals;
}
