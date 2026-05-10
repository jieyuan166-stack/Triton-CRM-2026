// components/clients/ClientHeader.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Mail,
  Pencil,
  Phone as PhoneIcon,
  Plus,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ClientAvatar } from "@/components/ui-shared/ClientAvatar";
import { DynamicTagBadge } from "@/components/ui-shared/DynamicTagBadge";
import {
  EmailPreviewDialog,
  type EmailPreviewPayload,
} from "@/components/dashboard/EmailPreviewDialog";
import { formatCurrencyCompact } from "@/lib/format";
import type { ClientWithStats } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ClientHeaderProps {
  client: ClientWithStats;
  onEdit?: () => void;
}

export function ClientHeader({ client, onEdit }: ClientHeaderProps) {
  const [composeOpen, setComposeOpen] = useState(false);
  const [composePayload, setComposePayload] =
    useState<EmailPreviewPayload | null>(null);

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

      <div className="flex flex-col md:flex-row md:items-center gap-5">
        {/* Avatar */}
        <ClientAvatar
          firstName={client.firstName}
          lastName={client.lastName}
          size="xl"
        />

        {/* Identity + contact */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 tracking-tight leading-tight">
              {client.firstName} {client.lastName}
            </h1>
            {client.tags.map((t) => (
              <DynamicTagBadge key={t} tag={t} />
            ))}
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

        {/* AUM block */}
        <div className="flex md:flex-col md:items-end gap-3 md:gap-1 md:text-right md:border-l md:border-slate-200 md:pl-6">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
              AUM
            </p>
            <p className="text-2xl md:text-3xl font-semibold text-slate-900 tabular-nums leading-none tracking-tight">
              {formatCurrencyCompact(client.aum)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {client.activePolicyCount} active{" "}
              {client.activePolicyCount === 1 ? "policy" : "policies"}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 md:flex-col md:gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit
          </Button>
          <Link
            href={`/policies/new?clientId=${client.id}`}
            className={cn(
              buttonVariants({ size: "sm" }),
              "bg-navy hover:bg-navy/90 text-white"
            )}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Policy
          </Link>
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
    </div>
  );
}
