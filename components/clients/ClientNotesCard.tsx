"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { UniversalDataCard } from "@/components/ui-shared/UniversalDataCard";
import { useData } from "@/components/providers/DataProvider";
import { normalizeClientNotes, removeAllCommunicationNoteBlocks } from "@/lib/communication-notes";
import type { Client } from "@/lib/types";

interface ClientNotesCardProps {
  client: Client;
}

export function ClientNotesCard({ client }: ClientNotesCardProps) {
  const { updateClientAsync } = useData();
  const initialNotes = removeAllCommunicationNoteBlocks(client.notes) ?? "";
  const [draft, setDraft] = useState(initialNotes);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [retry, setRetry] = useState(0);
  const lastSaved = useRef(initialNotes);

  useEffect(() => {
    const next = removeAllCommunicationNoteBlocks(client.notes) ?? "";
    setDraft(next);
    lastSaved.current = next;
    setStatus("idle");
  }, [client.id, client.notes]);

  useEffect(() => {
    const nextNotes = normalizeClientNotes(draft) ?? "";
    if (nextNotes === lastSaved.current) return;
    setStatus("saving");

    const timer = window.setTimeout(async () => {
      try {
        const saved = await updateClientAsync(client.id, { notes: nextNotes });
        if (!saved) throw new Error("Client not found");
        lastSaved.current = nextNotes;
        if (draft !== nextNotes) setDraft(nextNotes);
        setStatus("saved");
      } catch (error) {
        setStatus("error");
        toast.error("Unable to save client notes.", { description: error instanceof Error ? error.message : "Your notes are still here. Retry." });
      }
    }, 700);

    return () => window.clearTimeout(timer);
  }, [client.id, draft, retry, updateClientAsync]);

  return (
    <UniversalDataCard
      accentColor="#E9D5FF"
      title={
        <span className="text-sm font-bold uppercase tracking-widest text-slate-700">
          CLIENT NOTES
        </span>
      }
      badges={
        status === "saving" ? (
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Saving</span>
        ) : status === "saved" ? (
          <span className="text-[10px] font-medium uppercase tracking-wider text-purple-500">Saved</span>
        ) : status === "error" ? (
          <button type="button" className="text-[10px] font-semibold uppercase tracking-wider text-red-700 underline" onClick={() => setRetry((value) => value + 1)}>Retry save</button>
        ) : null
      }
      className="rounded-xl border border-slate-100 bg-white shadow-sm"
      contentClassName="space-y-3"
    >
      <Textarea
        value={draft}
        disabled={status === "saving"}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Add persistent notes for this client..."
        className="min-h-28 resize-none border-0 bg-transparent p-0 text-sm leading-relaxed text-slate-600 shadow-none outline-none placeholder:text-slate-300 focus-visible:ring-0"
      />
    </UniversalDataCard>
  );
}
