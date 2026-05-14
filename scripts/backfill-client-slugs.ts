import { PrismaClient } from "@prisma/client";
import { buildClientSlug } from "../lib/client-slug";

const prisma = new PrismaClient();

async function main() {
  const clients = await prisma.client.findMany({
    select: {
      id: true,
      slug: true,
      firstName: true,
      lastName: true,
    },
  });

  let updated = 0;
  for (const client of clients) {
    const slug = buildClientSlug(client);
    if (client.slug === slug) continue;
    await prisma.client.update({
      where: { id: client.id },
      data: { slug },
    });
    updated += 1;
  }

  console.log(`Backfilled ${updated} client slug${updated === 1 ? "" : "s"}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
