import type { Client } from "@/lib/types";

function normalizeSlugPart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildClientSlug(input: Pick<Client, "id" | "firstName" | "lastName">): string {
  const name = normalizeSlugPart(`${input.firstName} ${input.lastName}`) || "client";
  const suffix = input.id.slice(-4).toLowerCase();
  return `${name}-${suffix}`;
}

export function buildUniqueClientSlug(
  input: Pick<Client, "id" | "firstName" | "lastName">,
  existingClients: Array<Pick<Client, "id"> & { slug?: string }>
): string {
  const base = buildClientSlug(input);
  const used = new Set(
    existingClients
      .filter((client) => client.id !== input.id && client.slug)
      .map((client) => client.slug)
  );
  if (!used.has(base)) return base;

  let counter = 2;
  let next = `${base}-${counter}`;
  while (used.has(next)) {
    counter += 1;
    next = `${base}-${counter}`;
  }
  return next;
}

export function ensureUniqueClientSlugs<T extends Pick<Client, "id" | "firstName" | "lastName"> & { slug?: string }>(
  clients: T[]
): Array<T & { slug: string }> {
  const used = new Set<string>();
  return clients.map((client) => {
    const base = client.slug || buildClientSlug(client);
    let slug = base;
    let counter = 2;
    while (used.has(slug)) {
      slug = `${base}-${counter}`;
      counter += 1;
    }
    used.add(slug);
    return { ...client, slug };
  });
}

export function ensureClientSlug<T extends Pick<Client, "id" | "firstName" | "lastName"> & { slug?: string }>(
  client: T
): T & { slug: string } {
  return {
    ...client,
    slug: client.slug || buildClientSlug(client),
  };
}

export function clientPath(client: Pick<Client, "id"> & { slug?: string }): string {
  return `/clients/${client.slug || client.id}`;
}
