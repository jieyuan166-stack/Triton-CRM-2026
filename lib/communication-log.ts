export const MANUAL_COMMUNICATION_TYPES = [
  "Phone Call",
  "Meeting",
  "Zoom Meeting",
  "WeChat",
  "Text Message",
  "Note",
  "External Email",
] as const;

export type ManualCommunicationType = (typeof MANUAL_COMMUNICATION_TYPES)[number];
export const COMMUNICATION_TYPE_SEPARATOR = " + ";

export function parseCommunicationTypes(
  label: string | undefined | null
): string[] {
  return (label ?? "")
    .split(/\s*(?:\+|,)\s*/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function serializeCommunicationTypes(types: string[]) {
  const unique = Array.from(
    new Set(types.map((item) => item.trim()).filter(Boolean))
  );
  return unique.join(COMMUNICATION_TYPE_SEPARATOR);
}

export function isManualCommunicationLabel(
  label: string | undefined | null
): label is ManualCommunicationType {
  const types = parseCommunicationTypes(label);
  return (
    types.length > 0 &&
    types.every((type) =>
      MANUAL_COMMUNICATION_TYPES.includes(type as ManualCommunicationType)
    )
  );
}
