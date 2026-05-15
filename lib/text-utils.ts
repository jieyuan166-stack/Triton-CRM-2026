export function toTitleCase(value: string | undefined | null): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\b[\p{L}\p{N}]/gu, (letter) => letter.toUpperCase())
    .replace(/\b(Ii|Iii|Iv|V|Vi|Vii|Viii|Ix|X)\b/g, (match) =>
      match.toUpperCase()
    );
}

export function toTitleCaseName(value: string | undefined | null): string {
  return toTitleCase(value);
}

export function normalizeSearchText(value: string | undefined | null): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenMatch(query: string, fields: Array<string | undefined | null>) {
  const tokens = normalizeSearchText(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return false;
  const hay = normalizeSearchText(fields.filter(Boolean).join(" "));
  return tokens.every((token) => hay.includes(token));
}
