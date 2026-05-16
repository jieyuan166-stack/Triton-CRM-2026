export const MANUAL_COMMUNICATION_TYPES = [
  "Phone Call",
  "Meeting",
  "WeChat",
  "Text Message",
  "Note",
  "External Email",
] as const;

export type ManualCommunicationType = (typeof MANUAL_COMMUNICATION_TYPES)[number];

export function isManualCommunicationLabel(
  label: string | undefined | null
): label is ManualCommunicationType {
  return MANUAL_COMMUNICATION_TYPES.includes(label as ManualCommunicationType);
}
