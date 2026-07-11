// components/settings/BackupsSection.tsx
"use client";

import { useState } from "react";
import {
  Archive,
  Download,
  History,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Star,
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
import { useAuth } from "@/components/providers/AuthProvider";
import { EmptyState } from "@/components/ui-shared/EmptyState";
import { DisasterRecoverySection } from "@/components/settings/DisasterRecoverySection";
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

function backupDisplayName(backup: BackupRecord, isAdmin: boolean): string {
  const date = fmtTimestamp(backup.createdAt);
  if (backup.kind === "database") {
    if (backup.filename.includes("-pre-deploy")) return `Pre-deploy Database Backup · ${date}`;
    if (backup.filename.includes("-stable")) return `Stable Database Backup · ${date}`;
    if (backup.filename.includes("-manual")) return `Manual Database Backup · ${date}`;
    return `Database Backup · ${date}`;
  }
  const owner = isAdmin && (backup.ownerName || backup.ownerEmail)
    ? `${backup.ownerName || backup.ownerEmail} · `
    : "";
  const label = backup.source === "auto" ? "Automatic My Backup" : "Manual My Backup";
  return `${owner}${label} · ${date}`;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

async function waitForRestart() {
  // The restore route deliberately sends its success response before asking
  // Docker to restart the process. Give that hand-off time to begin, then
  // only reload once the replacement app reports a healthy database.
  await wait(7_000);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`/api/ready?restore=${Date.now()}`, { cache: "no-store" });
      if (response.ok) return true;
    } catch {
      // Expected while Docker is replacing the app process.
    }
    await wait(2_000);
  }
  return false;
}

type RestoreProgress = {
  target: BackupRecord;
  phase: "saving" | "restarting" | "complete" | "error";
  error?: string;
};

function backupTechnicalName(backup: BackupRecord): string {
  return backup.filename;
}

function backupTone(backup: BackupRecord) {
  return backup.kind === "database"
    ? {
        icon: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
        badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
        label: "Auto DB",
      }
    : backup.kind === "user-snapshot" && backup.source === "auto"
    ? {
        icon: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
        badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
        label: "Auto User Backup",
      }
    : backup.kind === "user-snapshot"
    ? {
        icon: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
        badge: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
        label: "Manual User Backup",
      }
    : {
        icon: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
        badge: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
        label: "Manual",
      };
}

export function BackupsSection() {
  const { session } = useAuth();
  const {
    settings,
    backups,
    refreshBackups,
    createBackup,
    restoreBackup,
    deleteBackup,
    setBackupImportant,
  } = useSettings();
  const { getSnapshot, replaceAll } = useData();
  const isAdmin = session?.user?.role === "admin";
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [restoreProgress, setRestoreProgress] = useState<RestoreProgress | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<BackupRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BackupRecord | null>(null);

  async function handleCreate() {
    setCreating(true);
    try {
      const snapshot = getSnapshot();
      const rec = await createBackup({
        ...snapshot,
        settings,
      });
      toast.success("Backup created", { description: backupDisplayName(rec, isAdmin) });
    } catch (e) {
      toast.error("Backup failed", {
        description: (e as Error).message,
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refreshBackups();
    } catch (error) {
      toast.error("Could not refresh backups", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  async function handleRestore() {
    if (!confirmTarget) return;
    setRestoring(confirmTarget.id);
    const target = confirmTarget;
    setConfirmTarget(null);
    setRestoreProgress({ target, phase: "saving" });
    const r = await restoreBackup(target.id);
    if (!r.ok) {
      setRestoring(null);
      setRestoreProgress({ target, phase: "error", error: r.error });
      toast.error("Restore failed", { description: r.error });
      void refreshBackups();
      return;
    }
    if (r.restartRequired) {
      setRestoreProgress({ target, phase: "restarting" });
      const restarted = await waitForRestart();
      setRestoring(null);
      if (!restarted) {
        setRestoreProgress({
          target,
          phase: "error",
          error: "CRM did not report ready within one minute. The database file was replaced; refresh this page after the container is healthy.",
        });
        return;
      }
      setRestoreProgress({ target, phase: "complete" });
      toast.success("Database restored successfully", { description: backupDisplayName(target, isAdmin) });
      await wait(1_500);
      window.location.assign("/settings?restore=database");
      return;
    }

    setRestoreProgress({ target, phase: "saving" });
    const replaced = await replaceAll(r.data);
    if (!replaced.ok) {
      setRestoring(null);
      setRestoreProgress({ target, phase: "error", error: replaced.error });
      toast.error("Restore failed", { description: replaced.error });
      return;
    }
    if (r.data.settings) {
      const settingsResponse = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(r.data.settings),
      });
      if (!settingsResponse.ok) {
        setRestoring(null);
        setRestoreProgress({ target, phase: "error", error: "CRM data was restored, but Settings could not be restored." });
        return;
      }
    }
    setRestoring(null);
    setRestoreProgress({ target, phase: "complete" });
    toast.success("Your backup was restored successfully", {
      description: backupDisplayName(target, isAdmin),
    });
    await wait(1_500);
    window.location.assign("/settings?restore=snapshot");
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const r = await deleteBackup(target.id);
    if (!r.ok) {
      toast.error("Delete failed", { description: r.error });
      void refreshBackups();
      return;
    }
    setDeleteTarget(null);
    toast.success("Backup deleted", { description: backupDisplayName(target, isAdmin) });
  }

  async function handleToggleImportant(b: BackupRecord) {
    const next = !b.important;
    try {
      const result = await setBackupImportant(b.id, next);
      if (!result.ok) {
        toast.error("Could not update backup marker", { description: result.error });
        void refreshBackups();
        return;
      }
      toast.success(next ? "Backup marked important" : "Backup unmarked", {
        description: backupDisplayName(b, isAdmin),
      });
    } catch (error) {
      toast.error("Could not update backup marker", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
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
      {isAdmin ? <DisasterRecoverySection /> : null}
      <div className="bg-card rounded-xl border border-slate-200 shadow-sm">
        <div className="px-5 md:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {isAdmin ? "All Backups" : "My Backups"}
            </h3>
            <p className="text-xs text-triton-muted mt-0.5">
              {isAdmin
                ? "Admin can manage full database backups and user snapshots stored on the NAS at "
                : "Your backups are user-scoped snapshots. They restore only your clients, policies, logs, and settings. Files are stored at "}
              <code className="font-number text-[11px] px-1 py-0.5 rounded bg-slate-100">
                /volume1/docker/triton-crm/backups/
              </code>
              .
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh backup list"
              aria-label="Refresh backup list"
            >
              {refreshing ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Refresh
            </Button>
            <Button
              type="button"
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
              {isAdmin ? "Database Backup" : "Backup Now"}
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
              const adminOnly = b.kind === "database" && !isAdmin;
              const tone = backupTone(b);
              const canRestore = b.kind === "database"
                ? isAdmin
                : !isAdmin || !b.ownerUserId || b.ownerUserId === session?.user?.id;
              return (
                <li
                  key={b.id}
                  className="flex items-center gap-3 px-5 md:px-6 py-3.5 hover:bg-slate-50 transition-colors"
                >
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${tone.icon}`}>
                    <Archive className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-triton-text truncate">
                      {backupDisplayName(b, isAdmin)}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-triton-muted mt-0.5">
                      <span className="inline-flex items-center gap-1">
                        <History className="h-3 w-3" />
                        {fmtTimestamp(b.createdAt)}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone.badge}`}>
                        {tone.label}
                      </span>
                      {adminOnly ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                          Admin only
                        </span>
                      ) : null}
                      {b.important ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-100">
                          Important
                        </span>
                      ) : null}
                      <span className="font-number">{fmtSize(b.size)}</span>
                      <span className="hidden md:inline truncate">
                        {b.contents.join(" · ")}
                      </span>
                      {isAdmin && b.ownerEmail ? (
                        <span className="hidden lg:inline truncate">
                          Owner: {b.ownerName || b.ownerEmail}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 max-w-full truncate font-number text-[10px] text-slate-400">
                      File: {backupTechnicalName(b)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className={`h-8 ${b.important ? "text-amber-500 hover:bg-amber-50 hover:text-amber-600" : "text-slate-300 hover:bg-amber-50 hover:text-amber-500"}`}
                      title={b.important ? "Important backup: protected from auto cleanup" : "Mark backup as important"}
                      aria-pressed={!!b.important}
                      aria-label={`${b.important ? "Unmark" : "Mark"} ${backupDisplayName(b, isAdmin)} as important`}
                      disabled={adminOnly}
                      onClick={() => handleToggleImportant(b)}
                    >
                      <Star className={`h-3.5 w-3.5 ${b.important ? "fill-current" : ""}`} />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8"
                      title="Download backup"
                      aria-label={`Download ${backupDisplayName(b, isAdmin)}`}
                      disabled={adminOnly}
                      onClick={() => handleDownload(b)}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={isRestoring || b.restorable === false || !canRestore}
                      title={
                        adminOnly
                          ? "System database backups can only be restored from the admin account."
                          : !canRestore
                          ? "Admins can download this user snapshot; the owner must restore it from their account."
                          : b.restorable === false
                          ? "This backup cannot be restored from Settings"
                          : b.filename.endsWith(".db.gz")
                          ? "Restore & restart CRM"
                          : "Restore backup"
                      }
                      onClick={() => setConfirmTarget(b)}
                    >
                      {isRestoring ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      {b.filename.endsWith(".db.gz") ? "Restore & Restart" : "Restore"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 text-slate-400 hover:text-accent-red hover:bg-accent-red/10"
                      title="Delete backup"
                      aria-label={`Delete ${backupDisplayName(b, isAdmin)}`}
                      disabled={isRestoring || adminOnly}
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Restore from this backup?</DialogTitle>
            <DialogDescription className="space-y-3 text-left">
              {confirmTarget ? (
                <>
                  <span className="block font-medium text-slate-800">
                    {backupDisplayName(confirmTarget, isAdmin)}
                  </span>
                  <span className="block break-all rounded-md bg-slate-50 p-2 font-number text-[11px] text-slate-500">
                    {backupTechnicalName(confirmTarget)}
                  </span>
                  <span className="block">
                    {confirmTarget.kind === "database"
                      ? "This will replace the full CRM database and restart the app."
                      : "This will replace your current CRM data and settings only."}{" "}
                    This is destructive and cannot be undone.
                  </span>
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:flex-row sm:items-center">
            <Button type="button" variant="ghost" onClick={() => setConfirmTarget(null)} className="sm:w-auto">
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-accent-red hover:bg-accent-red/90 text-white sm:w-auto whitespace-nowrap"
              onClick={handleRestore}
            >
              {confirmTarget?.filename.endsWith(".db.gz") ? "Restore & Restart" : "Confirm Restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!restoreProgress}
        onOpenChange={(open) => {
          if (!open && restoreProgress?.phase === "error") setRestoreProgress(null);
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={restoreProgress?.phase === "error"}>
          <DialogHeader>
            <DialogTitle>
              {restoreProgress?.phase === "saving"
                ? "Restoring your backup"
                : restoreProgress?.phase === "restarting"
                  ? "Restoring database and restarting CRM"
                  : restoreProgress?.phase === "complete"
                    ? "Restore complete"
                    : "Restore needs attention"}
            </DialogTitle>
            <DialogDescription className="space-y-3 text-left">
              <span className="block font-medium text-slate-800">
                {restoreProgress ? backupDisplayName(restoreProgress.target, isAdmin) : null}
              </span>
              {restoreProgress?.phase === "saving" ? (
                <span className="block">Saving the restored client data and settings. Keep this window open.</span>
              ) : null}
              {restoreProgress?.phase === "restarting" ? (
                <span className="block">The database has been replaced. CRM is restarting and this page will reload when the health check is ready.</span>
              ) : null}
              {restoreProgress?.phase === "complete" ? (
                <span className="block">The restored data is ready. Reloading Settings now.</span>
              ) : null}
              {restoreProgress?.phase === "error" ? (
                <span className="block text-accent-red">{restoreProgress.error}</span>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          {restoreProgress?.phase === "saving" || restoreProgress?.phase === "restarting" ? (
            <div className="flex items-center gap-2 text-sm text-triton-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Working safely…
            </div>
          ) : null}
          {restoreProgress?.phase === "error" ? (
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => window.location.reload()}>
                Refresh page
              </Button>
              <Button type="button" onClick={() => setRestoreProgress(null)}>
                Close
              </Button>
            </DialogFooter>
          ) : null}
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
              <span className="font-medium text-slate-800">{backupDisplayName(deleteTarget, isAdmin)}</span>?
              <span className="mt-2 block break-all rounded-md bg-slate-50 p-2 font-number text-[11px] text-slate-500">
                {backupTechnicalName(deleteTarget)}
              </span>
              {deleteTarget.important ? " This backup is marked important." : ""} This
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
