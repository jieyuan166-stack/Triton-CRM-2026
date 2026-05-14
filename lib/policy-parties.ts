import type { Client, Policy, PolicyInsuredPerson } from "@/lib/types";

export function clientFullName(client?: Pick<Client, "firstName" | "lastName"> | null) {
  if (!client) return "";
  return [client.firstName, client.lastName].filter(Boolean).join(" ").trim();
}

export function sanitizeInsuredPersons(value: unknown): PolicyInsuredPerson[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const people = value
    .map((person): PolicyInsuredPerson | null => {
      if (!person || typeof person !== "object") return null;
      const record = person as { name?: unknown; clientId?: unknown };
      const name = typeof record.name === "string" ? record.name.trim() : "";
      const clientId =
        typeof record.clientId === "string" && record.clientId.trim()
          ? record.clientId.trim()
          : undefined;

      if (!name) return null;
      return clientId ? { name, clientId } : { name };
    })
    .filter((person): person is PolicyInsuredPerson => person !== null)
    .slice(0, 2);

  return people.length > 0 ? people : undefined;
}

export function parseInsuredPersonsJson(value: string | null | undefined) {
  if (!value) return undefined;
  try {
    return sanitizeInsuredPersons(JSON.parse(value));
  } catch {
    return undefined;
  }
}

export function serializeInsuredPersonsJson(
  value: Policy["insuredPersons"] | unknown,
  partial = false,
) {
  if (value === undefined) return partial ? undefined : null;
  const sanitized = sanitizeInsuredPersons(value);
  return sanitized ? JSON.stringify(sanitized) : null;
}

export function partyDisplayName(
  person: PolicyInsuredPerson | undefined,
  getClient?: (id: string) => Client | undefined,
) {
  if (!person) return "";
  if (person.clientId && getClient) {
    const client = getClient(person.clientId);
    const name = clientFullName(client);
    if (name) return name;
  }
  return person.name;
}
