// components/clients/ClientInfoCard.tsx
"use client";

import { Cake, FileText, Mail, MapPin } from "lucide-react";
import { WidgetCard } from "@/components/ui-shared/WidgetCard";
import { calcAge, formatDate } from "@/lib/date-utils";
import type { Client } from "@/lib/types";

interface RowProps {
  icon: React.ElementType;
  label: string;
  value?: React.ReactNode;
}

function Row({ icon: Icon, label, value }: RowProps) {
  return (
    <li className="flex items-start gap-3">
      <div className="h-8 w-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
        <Icon className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
          {label}
        </p>
        <p className="text-sm text-triton-text break-words">
          {value || <span className="text-triton-muted">—</span>}
        </p>
      </div>
    </li>
  );
}

interface ClientInfoCardProps {
  client: Client;
}

export function ClientInfoCard({ client }: ClientInfoCardProps) {
  return (
    <WidgetCard title="Basic Info">
      <ul className="space-y-4">
        <Row
          icon={Cake}
          label="Birthday"
          value={
            client.birthday ? (
              <>
                {formatDate(client.birthday)}{" "}
                <span className="text-triton-muted">
                  ({calcAge(client.birthday)} yrs)
                </span>
              </>
            ) : null
          }
        />
        <Row icon={Mail} label="Email" value={client.email} />
        <Row
          icon={MapPin}
          label="Address"
          value={
            [
              [client.streetAddress, client.unit].filter(Boolean).join(", "),
              [client.city, client.province, client.postalCode]
                .filter(Boolean)
                .join(" "),
            ]
              .filter(Boolean)
              .join(" · ") || undefined
          }
        />
      </ul>

      {/* Notes */}
      {client.notes ? (
        <div className="mt-6 pt-5 border-t border-slate-100">
          <div className="flex items-center gap-1.5 mb-1.5">
            <FileText className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
              Notes
            </span>
          </div>
          <p className="text-sm text-triton-text whitespace-pre-wrap leading-relaxed">
            {client.notes}
          </p>
        </div>
      ) : null}
    </WidgetCard>
  );
}
