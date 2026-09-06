// Province defaults; regions spanning time zones can be refined by city later.
export const PROVINCE_TIMEZONES: Record<string, string> = {
  BC: "America/Vancouver", AB: "America/Edmonton", SK: "America/Regina",
  MB: "America/Winnipeg", ON: "America/Toronto", QC: "America/Toronto",
  NB: "America/Moncton", NS: "America/Halifax", PE: "America/Halifax",
  NL: "America/St_Johns", YT: "America/Whitehorse", NT: "America/Yellowknife",
  NU: "America/Iqaluit",
};

export function localCalendar(now: Date, zone = "America/Vancouver") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, year: get("year"),
    monthDay: `${get("month")}-${get("day")}`, weekday: get("weekday").toLowerCase(),
    minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function birthdayCycle(birthday: Date | null, province: string | null, now: Date) {
  const zone = PROVINCE_TIMEZONES[(province ?? "").trim().toUpperCase()] ?? "America/Vancouver";
  const local = localCalendar(now, zone);
  // Run throughout the birthday's local calendar day, never catch up yesterday.
  return birthday && birthday.toISOString().slice(5, 10) === local.monthDay
    ? { ...local, zone } : null;
}

export function isDefinitelyUnsent(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, responseCode } = error as { code?: string; responseCode?: number };
  return code === "EAUTH" || code === "ENOTFOUND" || code === "ECONNREFUSED" ||
    (typeof responseCode === "number" && responseCode >= 400 && responseCode <= 599);
}

export function digestFollowUpGroups<T extends { deadline: Date | null; importance: string | null; completedAt: Date | null }>(items: T[], now: Date) {
  const today = localCalendar(now).date;
  const overdue = items.filter((item) => !item.completedAt && item.deadline && item.deadline.toISOString().slice(0, 10) < today);
  const highPriority = items.filter((item) => !item.completedAt && item.importance === "High" && !overdue.includes(item));
  return { overdue, highPriority };
}
