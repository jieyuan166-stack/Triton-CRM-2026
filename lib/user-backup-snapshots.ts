import "server-only";

import { db } from "@/lib/db";
import type { BackupSnapshot } from "@/lib/settings-types";

export async function buildUserSnapshot(userId: string): Promise<BackupSnapshot> {
  const [clients, policies, followUps, relationships, emailReminderSends, settings] =
    await Promise.all([
      db.client.findMany({
        where: { userId },
        include: { emailHistory: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      }),
      db.policy.findMany({
        where: { userId },
        include: { beneficiaries: true },
        orderBy: [{ carrier: "asc" }, { policyNumber: "asc" }],
      }),
      db.followUp.findMany({
        where: { client: { userId } },
        orderBy: { date: "asc" },
      }),
      db.clientRelationship.findMany({
        where: {
          fromClient: { userId },
          toClient: { userId },
        },
        orderBy: { createdAt: "asc" },
      }),
      db.emailReminderSend.findMany({
        where: { client: { userId } },
        orderBy: { sentAt: "asc" },
      }),
      db.settings.findUnique({ where: { userId } }),
    ]);

  return {
    version: 1,
    scope: "user",
    ownerUserId: userId,
    capturedAt: new Date().toISOString(),
    clients,
    policies,
    followUps,
    relationships,
    emailReminderSends,
    settings: settings ? JSON.parse(settings.data) : undefined,
  };
}
