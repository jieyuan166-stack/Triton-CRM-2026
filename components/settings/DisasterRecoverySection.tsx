"use client";

import { useEffect, useMemo, useState } from "react";
import { ArchiveRestore, CheckCircle2, Cloud, Download, Loader2, Mail, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type RecoveryBackup = {
  filename: string;
  createdAt: string;
  reason: string;
  classes: string[];
  important: boolean;
  encrypted: true;
  sizeBytes: number;
  verifiedAt: string;
  remote: { uploaded: boolean; key: string; uploadedAt?: string | null };
  email: { sent: boolean; sentAt?: string | null };
  counts: Record<string, number>;
  uploads: { count: number; bytes: number };
  validation: Record<string, unknown>;
};

type RequestStatus = { id: string; state: "queued" | "running" | "completed" | "failed"; message: string; filename?: string | null; updatedAt: string };

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
}

export function DisasterRecoverySection() {
  const [backups, setBackups] = useState<RecoveryBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRequest, setActiveRequest] = useState<RequestStatus | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<RecoveryBackup | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState("");

  const refresh = async () => {
    const response = await fetch("/api/disaster-recovery", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not load disaster recovery backups");
    setBackups(payload.backups ?? []);
  };

  useEffect(() => {
    void refresh().catch((error) => toast.error("Could not load disaster recovery", { description: error.message })).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!activeRequest || ["completed", "failed"].includes(activeRequest.state)) return;
    const timer = window.setInterval(() => {
      void fetch(`/api/disaster-recovery/status/${activeRequest.id}`, { cache: "no-store" })
        .then((response) => response.json())
        .then((payload) => {
          if (!payload.ok) throw new Error(payload.error || "Status unavailable");
          setActiveRequest(payload.status);
          if (["completed", "failed"].includes(payload.status.state)) {
            if (payload.status.state === "completed") {
              toast.success("Disaster recovery request completed", { description: payload.status.message });
              void refresh();
            } else {
              toast.error("Disaster recovery request failed", { description: payload.status.message });
            }
          }
        })
        .catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [activeRequest]);

  const latest = backups[0];
  const activeLabel = useMemo(() => activeRequest ? `${activeRequest.state === "running" ? "Working" : "Queued"}: ${activeRequest.message}` : null, [activeRequest]);

  async function queue(action: "backup" | "test-email") {
    try {
      const response = await fetch("/api/disaster-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not queue request");
      setActiveRequest({ id: payload.request.id, state: "queued", message: "Waiting for the NAS worker", updatedAt: payload.request.requestedAt });
    } catch (error) {
      toast.error("Disaster recovery request failed", { description: error instanceof Error ? error.message : "Please try again." });
    }
  }

  async function queueRestore() {
    if (!restoreTarget || restoreConfirm !== "RESTORE") return;
    try {
      const response = await fetch("/api/disaster-recovery/restore-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: restoreTarget.filename, confirmation: "RESTORE" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not queue restore");
      setRestoreTarget(null);
      setRestoreConfirm("");
      setActiveRequest({ id: payload.request.id, state: "queued", message: "Restore is waiting for the NAS worker", filename: restoreTarget.filename, updatedAt: payload.request.requestedAt });
    } catch (error) {
      toast.error("Restore was not queued", { description: error instanceof Error ? error.message : "Please try again." });
    }
  }

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-amber-200 bg-amber-50/30 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-amber-100 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-slate-800">
            <ShieldCheck className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold uppercase tracking-wide">Disaster Recovery</h3>
          </div>
          <p className="mt-1 text-xs text-slate-600">Encrypted full CRM backup: database, relationships, users, settings, and managed uploads.</p>
          {latest ? <p className="mt-2 text-xs text-slate-500">Last verified: {formatDate(latest.verifiedAt)} · {latest.remote.uploaded ? "B2 uploaded" : "B2 pending"} · {latest.email.sent ? "email sent" : "email pending"}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={!!activeRequest && !["completed", "failed"].includes(activeRequest.state)} onClick={() => void queue("test-email")}>
            <Mail className="mr-1.5 h-3.5 w-3.5" /> Test email
          </Button>
          <Button type="button" size="sm" className="bg-navy text-white hover:bg-navy/90" disabled={!!activeRequest && !["completed", "failed"].includes(activeRequest.state)} onClick={() => void queue("backup")}>
            <Cloud className="mr-1.5 h-3.5 w-3.5" /> Full backup now
          </Button>
        </div>
      </div>
      {activeLabel ? <div className="flex items-center gap-2 border-b border-amber-100 bg-white/70 px-5 py-3 text-xs text-slate-600"><Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />{activeLabel}</div> : null}
      {loading ? <div className="flex h-24 items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading encrypted backups…</div> : backups.length === 0 ? <div className="px-5 py-6 text-sm text-slate-600">No completed encrypted disaster-recovery backup yet. Configure B2 and the NAS backup secrets, then run a full backup.</div> : (
        <ul className="divide-y divide-amber-100 bg-white/60">
          {backups.map((backup) => (
            <li key={backup.filename} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><p className="font-number text-xs font-semibold text-slate-700">{backup.filename}</p>{backup.important ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Important</span> : null}</div>
                <p className="mt-1 text-xs text-slate-500">{formatDate(backup.createdAt)} · {formatSize(backup.sizeBytes)} · Clients {backup.counts.clients ?? 0} · Policies {backup.counts.policies ?? 0} · Family {backup.counts.familyRelationships ?? 0} · Uploads {backup.uploads.count}</p>
                <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500"><span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-600" />Encrypted and verified</span><span>{backup.remote.uploaded ? "B2 uploaded" : "B2 pending"}</span><span>{backup.email.sent ? "Email sent" : "Email pending"}</span></div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => window.location.assign(`/api/disaster-recovery/${encodeURIComponent(backup.filename)}/download`)}><Download className="mr-1.5 h-3.5 w-3.5" />Download</Button>
                <Button type="button" size="sm" variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => setRestoreTarget(backup)}><ArchiveRestore className="mr-1.5 h-3.5 w-3.5" />Restore</Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!restoreTarget} onOpenChange={(open) => { if (!open) { setRestoreTarget(null); setRestoreConfirm(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Restore full CRM backup?</DialogTitle><DialogDescription>This will replace all users, clients, policies, relationships, notes, reminders, settings, and managed uploads with the selected backup.</DialogDescription></DialogHeader>
          <div className="rounded-md bg-slate-50 p-3 font-number text-[11px] text-slate-600 break-all">{restoreTarget?.filename}</div>
          <label className="text-sm font-medium text-slate-700" htmlFor="dr-restore-confirm">Type RESTORE to confirm</label>
          <input id="dr-restore-confirm" value={restoreConfirm} onChange={(event) => setRestoreConfirm(event.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-amber-500" autoComplete="off" />
          <DialogFooter><Button type="button" variant="outline" onClick={() => setRestoreTarget(null)}>Cancel</Button><Button type="button" className="bg-rose-700 text-white hover:bg-rose-800" disabled={restoreConfirm !== "RESTORE"} onClick={() => void queueRestore()}><TriangleAlert className="mr-1.5 h-3.5 w-3.5" />Queue restore</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
