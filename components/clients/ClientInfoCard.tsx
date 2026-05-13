// components/clients/ClientInfoCard.tsx
"use client";

import { Pencil } from "lucide-react";
import { WidgetCard } from "@/components/ui-shared/WidgetCard";
import { calcAge, formatDate } from "@/lib/date-utils";
import type { Client } from "@/lib/types";

interface RowProps {
  label: string;
  value?: React.ReactNode;
}

function Row({ label, value }: RowProps) {
  return (
    <li className="min-w-0">
      <p className="label-caps">{label}</p>
      <p className="mt-1 text-sm font-normal leading-relaxed text-slate-800 break-words">
        {value || <span className="text-slate-400">—</span>}
      </p>
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
      <ul className="space-y-5">
        <Row
          label="Birthday"
          value={
            client.birthday ? (
              <>
                {formatDate(client.birthday)}{" "}
                <span className="text-slate-500">
                  ({calcAge(client.birthday)} yrs)
                </span>
              </>
            ) : null
          }
        />
        <Row label="Email" value={client.email} />
        <Row
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
