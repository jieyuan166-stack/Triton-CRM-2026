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

  await db.user.upsert({
    where: { email },
    update: {
      name: "Jeffrey Y",
      role: "admin",
      passwordHash,
    },
    create: {
      email,
      name: "Jeffrey Y",
      role: "admin",
      passwordHash,
    },
  });

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
