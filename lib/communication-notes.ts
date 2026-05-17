import type { EmailHistoryEntry } from "./types";

export function normalizeClientNotes(notes: string | null | undefined): string | undefined {
  if (notes == null) return undefined;
  const normalized = notes.replace(/\r\n/g, "\n").trim();
  if (!normalized) return undefined;
  if (/^\\+$/.test(normalized)) return undefined;
  return normalized;
}

function isActionLogBlockForEntry(block: string, entry: EmailHistoryEntry) {
  const subject = entry.subject?.trim();
  const label = entry.templateLabel?.trim();

  if (!block.includes("Action Log:")) return false;

  if (label && block.includes(`Action Log: ${label} Sent`)) {
    return subject ? block.includes(subject) : true;
  }

  return Boolean(subject && block.includes(subject));
}

/**
 * Remove concise auto-note blocks that correspond to deleted email history.
 * Existing manual notes are left untouched. Supports both separators used by
 * the client and server code paths.
 */
export function removeCommunicationNoteBlocks(
  notes: string | undefined,
  entries: EmailHistoryEntry[]
): string | undefined {
  const normalizedNotes = normalizeClientNotes(notes);
  if (!normalizedNotes || entries.length === 0) return normalizedNotes;

  const blocks = normalizedNotes
    .split(/\n(?:———|---)\n/g)
    .map((block) => block.trim())
    .filter(Boolean);

  const kept = blocks.filter(
    (block) => !entries.some((entry) => isActionLogBlockForEntry(block, entry))
  );

  return kept.length > 0 ? kept.join("\n———\n") : undefined;
}

export function removeAllCommunicationNoteBlocks(
  notes: string | undefined
): string | undefined {
  const normalizedNotes = normalizeClientNotes(notes);
  if (!normalizedNotes) return undefined;

  const blocks = normalizedNotes
    .split(/\n(?:———|---)\n/g)
    .map((block) => block.trim())
    .filter(Boolean);

  const kept = blocks.filter((block) => !block.includes("Action Log:"));
  return kept.length > 0 ? kept.join("\n———\n") : undefined;
}
