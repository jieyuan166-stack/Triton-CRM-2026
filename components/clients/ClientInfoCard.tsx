// components/clients/ClientInfoCard.tsx
"use client";

import { Cake, Mail, MapPin, Pencil } from "lucide-react";
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
  onEdit?: () => void;
}

export function ClientInfoCard({ client, onEdit }: ClientInfoCardProps) {
  return (
    <div
      role={onEdit ? "button" : undefined}
      tabIndex={onEdit ? 0 : undefined}
      onClick={onEdit}
      onKeyDown={(event) => {
        if (!onEdit) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEdit();
        }
      }}
      className={
        onEdit
          ? "group rounded-xl outline-none transition focus-visible:ring-2 focus-visible:ring-accent-blue/40"
          : undefined
      }
    >
    <WidgetCard
      title="Basic Info"
      action={
        onEdit ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 transition group-hover:text-accent-blue">
            <Pencil className="h-3 w-3" />
            Click to edit
          </span>
        ) : undefined
      }
      className={onEdit ? "cursor-pointer transition group-hover:border-accent-blue/30 group-hover:shadow-md" : undefined}
    >
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
    </WidgetCard>
    </div>
  );
}
