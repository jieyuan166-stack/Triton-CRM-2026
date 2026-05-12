// components/clients/ClientHeader.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Mail,
  Pencil,
  Phone as PhoneIcon,
  Tags,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useData } from "@/components/providers/DataProvider";
import { ClientAvatar } from "@/components/ui-shared/ClientAvatar";
import { ClientNameDisplay } from "@/components/ui-shared/ClientNameDisplay";
import { ClientReportButton } from "@/components/clients/ClientReportButton";
import { DynamicTagBadge } from "@/components/ui-shared/DynamicTagBadge";
import {
  EmailPreviewDialog,
  type EmailPreviewPayload,
} from "@/components/dashboard/EmailPreviewDialog";
import { formatCurrencyCompact } from "@/lib/format";
import { calculateAutoClientTags } from "@/lib/client-tags";
import { TAG_VALUES, type TagValue } from "@/lib/constants";
import { calculatePortfolioMetrics } from "@/lib/portfolio-metrics";
import type { ClientWithStats, Policy } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ClientHeaderProps {
  client: ClientWithStats;
  reportPolicies?: Policy[];
  onEdit?: () => void;
}

export function ClientHeader({ client, reportPolicies = [], onEdit }: ClientHeaderProps) {
  const { policies, updateClient } = useData();
  const [composeOpen, setComposeOpen] = useState(false);
  const [composePayload, setComposePayload] =
    useState<EmailPreviewPayload | null>(null);
  const [tagEditorOpen, setTagEditorOpen] = useState(false);
  const [draftTags, setDraftTags] = useState<TagValue[]>([]);

  const autoTags = useMemo(
    () => calculateAutoClientTags(client, policies),
    [client, policies]
  );
  const clientMetrics = useMemo(
    () =>
      calculatePortfolioMetrics(
        policies.filter((policy) => policy.clientId === client.id)
      ),
    [client.id, policies]
  );
  const isVipClient = client.tags.includes("VIP");

  // Open the compose drawer prefilled with the client's email and the
  // configured signature. No template is applied — the advisor is writing
  // a one-off; the dashboard widgets handle the templated cases.
  function openCompose() {
    if (!client?.email) return;
    const fullName =
      `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() || "client";
    setComposePayload({
      contextLabel: fullName,
      to: client.email,
      subject: "",
      body: "",
      clientId: client.id,
      template: "custom",
    });
    setComposeOpen(true);
  }

  function openTagEditor() {
    setDraftTags(client.tags);
    setTagEditorOpen(true);
  }

  function toggleDraftTag(tag: TagValue, checked: boolean) {
    setDraftTags((prev) => {
      const set = new Set(prev);
      if (checked) set.add(tag);
      else set.delete(tag);
      return TAG_VALUES.filter((value) => set.has(value));
    });
  }

  function saveTags() {
    const manualTags = TAG_VALUES.filter(
      (tag) => draftTags.includes(tag) && !autoTags.includes(tag)
    );
    const hiddenTags = TAG_VALUES.filter(
      (tag) => autoTags.includes(tag) && !draftTags.includes(tag)
    );

    updateClient(client.id, { manualTags, hiddenTags });
    setTagEditorOpen(false);
    toast.success("Client tags updated.");
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 md:p-6 mb-6">
      {/* Back link */}
      <Link
        href="/clients"
        className="inline-flex items-center gap-1.5 text-xs text-triton-muted hover:text-triton-text mb-4 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to clients
      </Link>

      <div className="flex flex-col gap-5 md:flex-row md:items-center">
        {/* Avatar */}
        <ClientAvatar
          firstName={client.firstName}
          lastName={client.lastName}
          size="xl"
        />

        {/* Identity + contact */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h1 className="min-w-0">
              <ClientNameDisplay
                firstName={client.firstName}
                lastName={client.lastName}
                isVip={isVipClient}
                size="lg"
              />
            </h1>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={onEdit}
              aria-label={`Edit ${client.firstName} ${client.lastName}`}
              className="h-6 w-6 rounded-full text-slate-300 opacity-70 hover:bg-slate-100 hover:text-slate-600 hover:opacity-100"
            >
              <Pencil className="h-3 w-3" />
            </Button>
            {client.tags.map((t) => (
              <DynamicTagBadge key={t} tag={t} />
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={openTagEditor}
              className="h-6 rounded-full px-2 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <Tags className="mr-1 h-3 w-3" />
              Manage tags
            </Button>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
            {client.email ? (
              <button
                type="button"
                onClick={openCompose}
                title="Compose email"
                className="inline-flex items-center gap-1.5 text-slate-700 hover:text-accent-blue transition-colors"
              >
                <Mail className="h-3.5 w-3.5 text-slate-400" />
                {client.email}
              </button>
            ) : null}
            {client.phone ? (
              <a
                href={`tel:${client.phone}`}
                className="inline-flex items-center gap-1.5 text-slate-700 hover:text-accent-blue transition-colors"
              >
                <PhoneIcon className="h-3.5 w-3.5 text-slate-400" />
                {client.phone}
              </a>
            ) : null}
          </div>
        </div>

        {/* Portfolio metrics + report */}
        <div className="flex flex-col gap-3 md:items-end md:self-center">
          <div className="grid shrink-0 grid-cols-2 gap-3 md:min-w-[18rem] md:text-right">
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                Insurance Face Amount
              </p>
              <p className="mt-1 text-xl md:text-2xl font-semibold text-slate-900 tabular-nums leading-none tracking-tight">
                {formatCurrencyCompact(clientMetrics.insuranceFaceAmount)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {clientMetrics.activeInsuranceCount} active
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                Investment AUM
              </p>
              <p className="mt-1 text-xl md:text-2xl font-semibold text-slate-900 tabular-nums leading-none tracking-tight">
                {formatCurrencyCompact(clientMetrics.investmentAum)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {clientMetrics.activeInvestmentCount} active
              </p>
            </div>
          </div>

          <ClientReportButton
            client={client}
            policies={reportPolicies}
            className="self-start md:self-end"
          />
        </div>
      </div>

      {/* Compose dialog. Same primitive as the dashboard widgets so the
          advisor's mental model stays consistent — preview, edit, then
          Confirm & Send via Gmail. */}
      <EmailPreviewDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        payload={composePayload}
      />

      <Dialog open={tagEditorOpen} onOpenChange={setTagEditorOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Client Tags</DialogTitle>
            <DialogDescription>
              System tags are calculated from policies. You can hide them or add
              manual tags for this client.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {TAG_VALUES.map((tag) => {
              const checked = draftTags.includes(tag);
              const isAuto = autoTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleDraftTag(tag, !checked)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition",
                    checked
                      ? "border-accent-blue/30 bg-accent-blue/5"
                      : "border-slate-200 hover:bg-slate-50"
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) => toggleDraftTag(tag, value === true)}
                    onClick={(event) => event.stopPropagation()}
                  />
                  <DynamicTagBadge tag={tag} />
                  <span className="flex-1 text-xs text-slate-500">
                    {isAuto ? "System detected" : "Manual only"}
                  </span>
                  {checked ? <Check className="h-3.5 w-3.5 text-accent-blue" /> : null}
                </button>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTagEditorOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveTags} className="bg-navy text-white hover:bg-navy/90">
              Save Tags
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
