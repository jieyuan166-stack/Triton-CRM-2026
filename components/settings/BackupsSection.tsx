// components/settings/BackupsSection.tsx
"use client";

import { useState } from "react";
import {
  Archive,
  Download,
  History,
  Loader2,
  Play,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui-shared/ConfirmDialog";
import { useData } from "@/components/providers/DataProvider";
import { useSettings } from "@/components/providers/SettingsProvider";
import { EmptyState } from "@/components/ui-shared/EmptyState";
import { formatDate } from "@/lib/date-utils";
import {
  type BackupRecord,
} from "@/lib/settings-types";

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${formatDate(iso)} · ${time}`;
}

function backupTone(kind: BackupRecord["kind"]) {
  return kind === "database"
    ? {
        icon: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
        badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
        label: "Auto DB",
      }
    : {
        icon: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
        badge: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
        label: "Manual",
      };
}

export function BackupsSection() {
  const {
    backups,
    createBackup,
    restoreBackup,
    deleteBackup,
  } = useSettings();
  const { getSnapshot } = useData();
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<BackupRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BackupRecord | null>(null);

  async function handleCreate() {
    setCreating(true);
    try {
      const snapshot = getSnapshot();
      const rec = await createBackup(snapshot);
      toast.success("Backup created", { description: rec.filename });
    } catch (e) {
      toast.error("Backup failed", {
        description: (e as Error).message,
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleRestore() {
    if (!confirmTarget) return;
    setRestoring(confirmTarget.id);
    const target = confirmTarget;
    setConfirmTarget(null);
    const r = await restoreBackup(target.id);
    setRestoring(null);
    if (!r.ok) {
      toast.error("Restore failed", { description: r.error });
      return;
    }
    toast.success("Data restored successfully! Reloading…", {
      description: target.filename,
    });
    window.setTimeout(() => window.location.reload(), 600);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const r = await deleteBackup(target.id);
    if (!r.ok) {
      toast.error("Delete failed", { description: r.error });
      return;
    }
    toast.success("Backup deleted", { description: target.filename });
  }

  function handleDownload(b: BackupRecord) {
    const anchor = document.createElement("a");
    anchor.href = `/api/backups/${encodeURIComponent(b.id)}/download`;
    anchor.download = b.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  return (
    <>
      <div className="bg-card rounded-xl border border-slate-200 shadow-sm">
        <div className="px-5 md:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Backups
            </h3>
            <p className="text-xs text-triton-muted mt-0.5">
              Manual snapshots and daily database backups are real files stored on the NAS at{" "}
              <code className="font-mono text-[11px] px-1 py-0.5 rounded bg-slate-100">
                /volume1/docker/triton-crm/backups/
              </code>
              .
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={creating}
              className="bg-navy hover:bg-navy/90 text-white"
            >
              {creating ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 mr-1.5" />
              )}
              Backup Now
            </Button>
          </div>
        </div>

        {backups.length === 0 ? (
          <EmptyState
            icon={Archive}
            title="No backups yet"
            description="Click 'Backup Now' to create the first one."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {backups.map((b) => {
              const isRestoring = restoring === b.id;
              const tone = backupTone(b.kind);
              return (
                <li
                  key={b.id}
                  className="flex items-center gap-3 px-5 md:px-6 py-3.5 hover:bg-slate-50 transition-colors"
                >
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${tone.icon}`}>
                    <Archive className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono font-medium text-triton-text truncate">
                      {b.filename}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-triton-muted mt-0.5">
                      <span className="inline-flex items-center gap-1">
                        <History className="h-3 w-3" />
                        {fmtTimestamp(b.createdAt)}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone.badge}`}>
                        {tone.label}
                      </span>
                      <span className="tabular-nums">{fmtSize(b.size)}</span>
                      <span className="hidden md:inline truncate">
                        {b.contents.join(" · ")}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8"
                      title="Download backup"
                      aria-label={`Download ${b.filename}`}
                      onClick={() => handleDownload(b)}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={isRestoring || b.restorable === false}
                      title={b.restorable === false ? "SQLite backups are file-level backups. Restore from NAS/SSH after stopping the app." : "Restore backup"}
                      onClick={() => setConfirmTarget(b)}
                    >
                      {isRestoring ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-slate-400 hover:text-accent-red hover:bg-accent-red/10"
                      title="Delete backup"
                      aria-label={`Delete ${b.filename}`}
                      disabled={isRestoring}
                      onClick={() => setDeleteTarget(b)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Restore confirmation */}
      <Dialog
        open={!!confirmTarget}
        onOpenChange={(o) => !o && setConfirmTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore from this backup?</DialogTitle>
            <DialogDescription>
              {confirmTarget ? (
                <>
                  <span className="font-mono">{confirmTarget.filename}</span>{" "}
                  will overwrite all current data. This is destructive and
                  cannot be undone — current state should be backed up first.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmTarget(null)}>
              Cancel
            </Button>
            <Button
              className="bg-accent-red hover:bg-accent-red/90 text-white"
              onClick={handleRestore}
            >
              Confirm Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation — uses the shared ConfirmDialog so the copy and
          button styling match the Clients delete flow. */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
        title="Delete Backup?"
        description={
          deleteTarget ? (
            <>
              Are you sure you want to delete{" "}
              <span className="font-mono">{deleteTarget.filename}</span>? This
              action cannot be undone.
            </>
          ) : (
            "Are you sure you want to delete this backup file? This action cannot be undone."
          )
        }
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </>
  );
}
