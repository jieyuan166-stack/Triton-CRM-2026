import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  assert.match(process.env.DATABASE_URL ?? "", /triton-core-test-/);
  const passwordHash = await bcrypt.hash("Test-only-password-123!", 4);
  for (const id of ["test-a", "test-b"]) {
    await db.user.upsert({ where: { id }, update: { passwordHash }, create: { id, email: `${id}@example.invalid`, name: id, passwordHash } });
    await db.client.upsert({ where: { id: `${id}-client` }, update: {}, create: { id: `${id}-client`, userId: id, slug: `${id}-client`, firstName: "Example", lastName: id, email: "example@example.invalid" } });
    await db.policy.upsert({ where: { id: `${id}-policy` }, update: {}, create: { id: `${id}-policy`, userId: id, clientId: `${id}-client`, policyNumber: "TEST-001", carrier: "Manulife", productName: "Test Investment", category: "Investment", productType: "TFSA", sumAssured: 1000, premium: 0, paymentFrequency: "Monthly", effectiveDate: new Date("2026-01-01"), status: "active", ongoingInvestmentAmount: 100, ongoingInvestmentFrequency: "Monthly", ongoingInvestmentStartDate: new Date("2026-01-01") } });
  }
}
main().finally(() => db.$disconnect());
