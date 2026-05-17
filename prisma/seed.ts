import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || "jieyuan165@gmail.com";
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!password || password.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must be set and at least 12 characters.");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    await db.user.update({
      where: { email },
      data: {
        name: existing.name || "Triton CRM User",
        passwordHash,
      },
    });
  } else {
    await db.user.create({
      data: {
        email,
        name: email === "admin@tritonwealth.ca" ? "Admin" : "Triton CRM User",
        role: email === "admin@tritonwealth.ca" ? "admin" : "advisor",
        passwordHash,
      },
    });
  }

  console.log(`Seeded admin user: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
