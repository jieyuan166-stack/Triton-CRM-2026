"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { UniversalDataCard } from "@/components/ui-shared/UniversalDataCard";
import { useData } from "@/components/providers/DataProvider";
import type { Client } from "@/lib/types";

interface ClientNotesCardProps {
  client: Client;
}

export function ClientNotesCard({ client }: ClientNotesCardProps) {
  const { updateClient } = useData();
  const [draft, setDraft] = useState(client.notes ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const lastSaved = useRef(client.notes ?? "");

  useEffect(() => {
    const next = client.notes ?? "";
    setDraft(next);
    lastSaved.current = next;
    setStatus("idle");
  }, [client.id, client.notes]);

  useEffect(() => {
    if (draft === lastSaved.current) return;
    setStatus("saving");

    const timer = window.setTimeout(() => {
      const saved = updateClient(client.id, { notes: draft.trim() || undefined });
      if (!saved) {
        setStatus("idle");
        toast.error("Unable to save client notes.");
        return;
      }
      lastSaved.current = draft;
      setStatus("saved");
    }, 700);

    return () => window.clearTimeout(timer);
  }, [client.id, draft, updateClient]);

  return (
    <UniversalDataCard
      accentColor="#E9D5FF"
      title={
        <span className="label-caps">
          CLIENT NOTES
        </span>
      }
      badges={
        status === "saving" ? (
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Saving</span>
        ) : status === "saved" ? (
          <span className="text-[10px] font-medium uppercase tracking-wider text-purple-500">Saved</span>
        ) : null
      }
      className="rounded-xl border border-slate-100 bg-white shadow-sm"
      contentClassName="space-y-3"
    >
      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Add persistent notes for this client..."
        className="min-h-28 resize-none border-0 bg-transparent p-0 text-sm leading-relaxed text-slate-600 shadow-none outline-none placeholder:text-slate-300 focus-visible:ring-0"
      />
    </UniversalDataCard>
  );
}
