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
