import { PrismaClient } from "@prisma/client";
import { buildUniqueClientSlug } from "../lib/client-slug";

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
  const processed = clients.map((client) => ({
    ...client,
    slug: client.slug ?? undefined,
  }));
  for (const client of clients) {
    const slug = buildUniqueClientSlug(client, processed);
    if (client.slug === slug) continue;
    await prisma.client.update({
      where: { id: client.id },
      data: { slug },
    });
    const processedClient = processed.find((item) => item.id === client.id);
    if (processedClient) processedClient.slug = slug;
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
