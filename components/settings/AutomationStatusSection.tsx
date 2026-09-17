"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui-shared/ConfirmDialog";

type Run = { kind: string; startedAt: string; lastSuccessAt: string | null; sent: number; skipped: number; failed: number; review: number; reasons: string };
type DeliveryTask = { id: string; dedupeKey: string; type: string; stage: string | null; status: string; startedAt: string; errorCode: string | null;
  clientName: string | null; clientHref: string | null; policyNumber: string | null; policyLabel: string | null; canResolve: boolean };
type State = { runs: Run[]; nextCheck: string; nextDigest: string | null; nextBackup: string | null;
  premiumEnabled: boolean; birthdayEnabled: boolean; digestEnabled: boolean; followUpReminderCount: number; backupEnabled: boolean;
  tasks: DeliveryTask[] };
const stamp = (value?: string | null) => value ? new Date(value).toLocaleString("en-CA", { timeZone: "America/Vancouver" }) : "Not recorded";
const parseReasons = (value?: string) => {
  if (!value) return {} as Record<string, number>;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] =>
        typeof entry[1] === "number"
      )
    );
  } catch {
    return {};
  }
};

export function AutomationStatusSection() {
  const [data, setData] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reviewAction, setReviewAction] = useState<{ task: DeliveryTask; resolution: "retry" | "confirm-sent" } | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { const response = await fetch("/api/settings/automation-status", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load status. Please retry.");
      setData(await response.json()); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Status unavailable"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 60_000); return () => clearInterval(timer); }, [refresh]);

  async function resolveReview() {
    if (!reviewAction) return;
    const response = await fetch("/api/settings/automation-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: reviewAction.task.id, resolution: reviewAction.resolution }),
    });
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) throw new Error(result?.error || "Could not resolve delivery review");
    await refresh();
    toast.success(reviewAction.resolution === "retry" ? "Delivery restored for retry" : "Delivery marked completed");
  }

  return <div className="space-y-5 min-w-0">
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-navy">Automation status</h2>
      <Button variant="outline" size="icon" title="Refresh status" aria-label="Refresh status" disabled={loading} onClick={refresh}><RefreshCw className="h-4 w-4" /></Button></div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!data && loading && <p role="status">Loading...</p>}
    {data && <>
      <p className="text-xs text-slate-500">Schedule times: Vancouver. Birthdays: customer province time zone.</p>
      {[{ kind: "customer-email", title: "Customer reminders", enabled: data.premiumEnabled || data.birthdayEnabled, next: data.nextCheck },
        { kind: "follow-up-reminder", title: "Advisor follow-up reminders", enabled: true, next: data.nextCheck },
        { kind: "weekly-digest", title: "Weekly advisor digest", enabled: data.digestEnabled, next: data.nextDigest },
        { kind: "user-backup", title: "Weekly customer backup", enabled: data.backupEnabled, next: data.nextBackup }].map((item) => {
          const run = data.runs.find((row) => row.kind === item.kind);
          const overdueCheck = item.kind !== "user-backup" && item.enabled && run && Date.now() - new Date(run.startedAt).getTime() > 45 * 60_000;
          return <section key={item.kind} className="border-b border-slate-200 pb-5 space-y-2">
            <h3 className="font-semibold text-sm">{item.title} <span className={item.enabled ? "text-emerald-700" : "text-slate-400"}>{item.enabled ? "Enabled" : "Disabled"}</span></h3>
            {item.kind === "customer-email" && <p className="text-xs text-slate-500">Premium: {data.premiumEnabled ? "On" : "Off"} · Birthday: {data.birthdayEnabled ? "On" : "Off"}</p>}
            {item.kind === "follow-up-reminder" && <p className="text-xs text-slate-500">{data.followUpReminderCount} task{data.followUpReminderCount === 1 ? "" : "s"} scheduled for advisor email.</p>}
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600">
              <div><dt>Next scheduled check</dt><dd>{item.enabled ? stamp(item.next) : "Disabled"}</dd></div>
              <div><dt>Last check</dt><dd>{stamp(run?.startedAt)}</dd></div>
              <div><dt>Last successful send / backup</dt><dd>{stamp(run?.lastSuccessAt)}</dd></div>
              <div><dt>Last run</dt><dd>{run ? `${run.sent} completed · ${run.skipped} skipped · ${run.failed} failed · ${run.review} review` : "Not recorded"}</dd></div>
            </dl>
            {overdueCheck && <p className="text-xs text-amber-700">Scheduled check is overdue.</p>}
            {run && Object.entries(parseReasons(run.reasons)).map(([reason,count]) => <p key={reason} className="text-xs text-slate-500">{reason}: {count}</p>)}
          </section>;
        })}
      <h3 className="font-semibold text-sm">Recent deliveries</h3>
      <div className="divide-y divide-slate-100">
        {data.tasks.length === 0 && <p className="text-sm text-slate-500">No delivery tasks recorded yet.</p>}
        {data.tasks.map((task) => <div key={task.id} className="py-3 flex flex-wrap justify-between gap-2 text-xs">
          <div className="min-w-0"><p className="font-medium break-words">{task.clientHref ? <Link href={task.clientHref} className="text-navy underline">{task.clientName}</Link> : "Advisor digest"}</p>
            <p className="text-slate-500">{task.type} {task.stage} · {stamp(task.startedAt)}</p>
            {task.policyLabel ? <p className="mt-0.5 text-slate-500">{task.policyLabel}{task.policyNumber ? ` · #${task.policyNumber}` : ""}</p> : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className={task.status === "review" || task.status === "failed" ? "text-amber-700 font-semibold" : "text-slate-500"}>{task.status === "review" ? "Needs review in Gmail Sent" : task.status}</span>
            {task.status === "review" && task.canResolve ? <>
              <Button size="xs" variant="outline" className="border-amber-200 text-amber-800" onClick={() => setReviewAction({ task, resolution: "retry" })}>
                <RotateCcw /> Retry
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setReviewAction({ task, resolution: "confirm-sent" })}>
                <CheckCircle2 /> Found in Sent
              </Button>
            </> : null}
          </div>
        </div>)}
      </div>
    </>}
    <ConfirmDialog
      open={!!reviewAction}
      onOpenChange={(open) => { if (!open) setReviewAction(null); }}
      title={reviewAction?.resolution === "retry" ? "Retry this delivery?" : "Confirm this delivery?"}
      description={reviewAction?.resolution === "retry"
        ? "First check Gmail Sent. Confirm Retry only when the email is not there; the next automation run will retry it once."
        : "Use this only when the email is visible in Gmail Sent. The CRM will record it as completed without sending another copy."}
      confirmLabel={reviewAction?.resolution === "retry" ? "Confirm Retry" : "Mark Completed"}
      tone="primary"
      onConfirm={resolveReview}
    />
  </div>;
}
