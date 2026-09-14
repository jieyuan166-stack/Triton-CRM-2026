import { localCalendar } from "@/lib/automation-calendar";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function nextAnnualDeadline(date: string): string | null {
  const match = DATE_ONLY.exec(date);
  if (!match) return null;
  const year = Number(match[1]) + 1;
  const month = Number(match[2]);
  const day = Number(match[3]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function calendarDayNumber(date: string): number | null {
  const match = DATE_ONLY.exec(date);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000;
}

export function followUpReminderDue(
  deadline: string,
  leadDays: number,
  now = new Date(),
): boolean {
  if (!Number.isInteger(leadDays) || leadDays < 1 || leadDays > 365) return false;
  const local = localCalendar(now, "America/Vancouver");
  if (local.minutes < 8 * 60) return false;
  const deadlineDay = calendarDayNumber(deadline);
  const todayDay = calendarDayNumber(local.date);
  if (deadlineDay === null || todayDay === null) return false;
  const days = deadlineDay - todayDay;
  return days >= 0 && days <= leadDays;
}

export function followUpReminderDedupeKey(input: {
  userId: string;
  followUpId: string;
  deadline: string;
  leadDays: number;
}) {
  return `follow-up-advisor:${input.userId}:${input.followUpId}:${input.deadline}:${input.leadDays}`;
}
