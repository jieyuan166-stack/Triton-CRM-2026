import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../lib/db";
import { deliverOnce, restoreDeliveryGuards, runForAdvisor } from "../lib/email-delivery";
import { birthdayCycle, digestFollowUpGroups, isDefinitelyUnsent, PROVINCE_TIMEZONES } from "../lib/automation-calendar";
import { resolveEmailContext, sendContextSchema } from "../lib/email-send-context";
import { buildUserSnapshot } from "../lib/user-backup-snapshots";
import { getPremiumReminderStage, premiumReminderDedupeKey } from "../lib/premium-reminders";
import { buildWeeklyDigest } from "../lib/weekly-digest";

before(async () => {
  assert.match(process.env.DATABASE_URL ?? "", /triton-core-test-/);
  for (const id of ["test-a", "test-b"]) {
    await db.user.create({ data: { id, email: `${id}@example.invalid`, name: id, passwordHash: "unusable-test-hash" } });
    await db.client.create({ data: { id: `${id}-client`, userId: id, firstName: "Example", lastName: id, email: "same@example.invalid" } });
    await db.policy.create({ data: { id: `${id}-policy`, userId: id, clientId: `${id}-client`, policyNumber: "SHARED-NUMBER", carrier: "Manulife", category: "Insurance", productType: "Term", productName: "Test Term", effectiveDate: new Date("2026-01-01"), sumAssured: 100, premium: 10, paymentFrequency: "Annual", status: "active" } });
  }
});
after(async () => { await db.$disconnect(); });
const identity = (key: string) => ({ userId: "test-a", type: "premium", cycleKey: "2026-09", clientId: "test-a-client", dedupeKey: key });

test("one persistent claim wins concurrent workers and retries", async () => {
  let sends = 0;
  const send = async () => { sends++; await new Promise((resolve) => setTimeout(resolve, 30)); return { messageId: "test-message" }; };
  const results = await Promise.all(Array.from({ length: 5 }, () => deliverOnce(identity("concurrent"), send, async () => {})));
  assert.equal(sends, 1);
  assert.equal(results.filter((result) => result.status === "sent").length, 1);
  await deliverOnce(identity("concurrent"), send, async () => {});
  assert.equal(sends, 1);
});
test("SMTP acceptance followed by log failure never automatically resends", async () => {
  let sends = 0;
  const send = async () => { sends++; return { messageId: "accepted-but-unlogged" }; };
  assert.equal((await deliverOnce(identity("uncertain-log"), send, async () => { throw Error("disk failure"); })).status, "review");
  await deliverOnce(identity("uncertain-log"), send, async () => {});
  assert.equal(sends, 1);
  assert.equal((await db.emailDeliveryTask.findUniqueOrThrow({ where: { dedupeKey: "uncertain-log" } })).messageId, "accepted-but-unlogged");
});
test("SMTP timeout needs review; explicit rejection may retry after cooldown", async () => {
  assert.equal(isDefinitelyUnsent({ code: "ETIMEDOUT" }), false);
  assert.equal(isDefinitelyUnsent({ code: "EAUTH" }), true);
  assert.equal((await deliverOnce(identity("reject"), async () => { throw { code: "EAUTH" }; }, async () => {})).status, "failed");
  await db.emailDeliveryTask.update({ where: { dedupeKey: "reject" }, data: { startedAt: new Date(Date.now() - 16 * 60_000) } });
  assert.equal((await deliverOnce(identity("reject"), async () => ({ messageId: "retry-ok" }), async () => {})).status, "sent");
});
test("one advisor failure does not block the next advisor", async () => {
  const failed = await runForAdvisor("test-a", "test", async () => { throw Error("SMTP config"); });
  const success = await runForAdvisor("test-b", "test", async (record) => record({ status: "sent" }));
  assert.equal(failed.failed, 1);
  assert.equal(success.sent, 1);
});
test("recipient and stage have independent premium dedupe keys", () => {
  assert.equal(getPremiumReminderStage(30), "first");
  assert.equal(getPremiumReminderStage(16), "first");
  assert.equal(getPremiumReminderStage(15), "second");
  assert.equal(getPremiumReminderStage(0), "second");
  assert.equal(getPremiumReminderStage(-1), null);
  const keys = ["owner", "joint"].flatMap((clientId) => ["first", "second"].map((stage) => premiumReminderDedupeKey({ clientId, policyId: "p", cycleKey: "p:2026-09-30", stage: stage as "first" | "second" })));
  assert.equal(new Set(keys).size, 4);
});
test("birthdays catch up on the current local day only, across provinces and DST", () => {
  assert.equal(Object.keys(PROVINCE_TIMEZONES).length, 13);
  const birthday = new Date("1980-09-06T00:00:00Z");
  assert.equal(birthdayCycle(birthday, "BC", new Date("2026-09-06T06:59:00Z")), null);
  assert.ok(birthdayCycle(birthday, "NL", new Date("2026-09-06T02:30:00Z")));
  assert.ok(birthdayCycle(birthday, "BC", new Date("2026-09-06T20:00:00Z")));
  assert.equal(birthdayCycle(birthday, "BC", new Date("2026-09-07T07:00:00Z")), null);
  assert.ok(birthdayCycle(new Date("1980-11-01T00:00:00Z"), "BC", new Date("2026-11-01T09:30:00Z")));
});
test("weekly overdue requires a real deadline, keeps high priority separate", () => {
  const items = [{ deadline: null, importance: null, completedAt: null }, { deadline: null, importance: "High", completedAt: null }, { deadline: new Date("2026-09-04"), importance: "High", completedAt: null }, { deadline: new Date("2026-09-04"), importance: "High", completedAt: new Date() }];
  const groups = digestFollowUpGroups(items, new Date("2026-09-05T18:00:00Z"));
  assert.deepEqual(groups.overdue, [items[2]]);
  assert.deepEqual(groups.highPriority, [items[1]]);
});
test("email contexts and backup snapshots cannot expose another advisor", async () => {
  const context = sendContextSchema.parse({ body: "text", policyIds: ["test-b-policy"] });
  await assert.rejects(resolveEmailContext("test-a", "test-a-client", context));
  await assert.rejects(resolveEmailContext("test-a", "test-b-client", sendContextSchema.parse({ body: "text" })));
  await db.client.create({ data: { id: "test-a-other-client", userId: "test-a", firstName: "Other", lastName: "Client", email: "other@example.invalid" } });
  await db.policy.create({ data: { id: "test-a-other-policy", userId: "test-a", clientId: "test-a-other-client", policyNumber: "OTHER-POLICY", carrier: "Manulife", category: "Insurance", productType: "Term", productName: "Other Term", effectiveDate: new Date("2026-01-01"), sumAssured: 100, premium: 10, paymentFrequency: "Annual", status: "active" } });
  await assert.rejects(resolveEmailContext("test-a", "test-a-client", sendContextSchema.parse({ body: "text", policyIds: ["test-a-other-policy"] })));
  await db.policy.delete({ where: { id: "test-a-other-policy" } });
  await db.client.delete({ where: { id: "test-a-other-client" } });
  const snapshot = await buildUserSnapshot("test-a");
  assert.equal(snapshot.clients.length, 1);
  assert.equal(snapshot.policies.length, 1);
  assert.ok(snapshot.emailDeliveryTasks?.length);
  assert.ok((snapshot.clients as { userId: string }[]).every((client) => client.userId === "test-a"));
  await db.$transaction((tx) => restoreDeliveryGuards(tx, snapshot.emailDeliveryTasks!, "test-a"));
  await assert.rejects(db.$transaction((tx) => restoreDeliveryGuards(tx, snapshot.emailDeliveryTasks!, "test-b")));
  assert.equal((await db.emailDeliveryTask.findUniqueOrThrow({ where: { dedupeKey: "uncertain-log" } })).status, "review");
});
test("weekly digest does not truncate at 20 and is tenant scoped", async () => {
  for (let n = 0; n < 24; n++) await db.followUp.create({ data: { clientId: "test-a-client", createdById: "test-a", summary: "Example task", type: "Note", date: new Date("2026-09-01"), deadline: new Date("2026-09-02") } });
  const a = await buildWeeklyDigest("test-a", new Date("2026-09-05T18:00:00Z"));
  const b = await buildWeeklyDigest("test-b", new Date("2026-09-05T18:00:00Z"));
  assert.equal(a.overdueFollowUps.length, 24);
  assert.equal(b.overdueFollowUps.length, 0);
});
