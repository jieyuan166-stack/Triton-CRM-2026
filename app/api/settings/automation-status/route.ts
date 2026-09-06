import { NextResponse } from "next/server";
import { requireSession, unauthorized } from "@/lib/api-security";
import { db } from "@/lib/db";
import { readWeeklyDigestSettings, isWeeklyDigestDue } from "@/lib/weekly-digest";
import { localCalendar } from "@/lib/automation-calendar";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();
  try {
    const userId = session.user.id;
    const [runs, tasks, settings] = await Promise.all([
      db.automationRun.findMany({ where: { userId } }),
      db.emailDeliveryTask.findMany({ where: { userId }, orderBy: { startedAt: "desc" }, take: 100 }),
      readWeeklyDigestSettings(userId),
    ]);
    const clients = await db.client.findMany({ where: { userId, id: { in: tasks.flatMap((task) => task.clientId ? [task.clientId] : []) } }, select: { id: true, slug: true, firstName: true, lastName: true, companyName: true } });
    const now = Date.now();
    const nextCheck = new Date((Math.floor(now / 900_000) + 1) * 900_000);
    let nextDigest: string | null = null;
    let nextBackup: string | null = null;
    for (let minute = 0; minute <= 8 * 24 * 60; minute += 15) {
      const date = new Date(nextCheck.getTime() + minute * 60_000);
      const local = localCalendar(date);
      const digestAlreadySent = tasks.some((task) => task.type === "weekly-digest" && task.status === "sent" && task.cycleKey.startsWith(local.date));
      if (!nextDigest && !digestAlreadySent && isWeeklyDigestDue(settings, date)) nextDigest = date.toISOString();
      if (!nextBackup && local.weekday === "sunday" && local.minutes === 120) nextBackup = date.toISOString();
      if (nextDigest && nextBackup) break;
    }
    return NextResponse.json({ runs, nextCheck: nextCheck.toISOString(), nextDigest, nextBackup,
      premiumEnabled: settings.emailAutomation.premiumRemindersEnabled,
      birthdayEnabled: settings.emailAutomation.birthdayGreetingsEnabled,
      digestEnabled: settings.weeklyDigest.enabled,
      backupEnabled: session.user.role !== "admin",
      tasks: tasks.map((task) => {
        const client = clients.find((item) => item.id === task.clientId);
        return { id: task.id, type: task.type, stage: task.stage, status: task.status === "sending" && now - task.startedAt.getTime() > 10 * 60_000 ? "review" : task.status,
          startedAt: task.startedAt, finishedAt: task.finishedAt, errorCode: task.errorCode,
          clientName: client ? client.companyName || `${client.firstName} ${client.lastName}` : null,
          clientHref: client ? `/clients/${client.slug || client.id}#activity` : null };
      }),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Unable to load automation status" }, { status: 500 }); }
}
