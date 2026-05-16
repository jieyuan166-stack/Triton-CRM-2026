"use client";

import Link from "next/link";
import { ArrowUpRight, UsersRound } from "lucide-react";
import { ClientAvatar } from "@/components/ui-shared/ClientAvatar";
import { ClientNameDisplay } from "@/components/ui-shared/ClientNameDisplay";
import { StatusBadge } from "@/components/ui-shared/StatusBadge";
import { WidgetCard } from "@/components/ui-shared/WidgetCard";
import { calculateClientTags } from "@/lib/client-tags";
import { clientPath } from "@/lib/client-slug";
import { getVisibleFamilyLinks } from "@/lib/family";
import type { Client, ClientRelationship, Policy } from "@/lib/types";

interface LinkedFamilyCompactCardProps {
  client: Client;
  clients: Client[];
  policies: Policy[];
  relationships: ClientRelationship[];
}

export function LinkedFamilyCompactCard({
  client,
  clients,
  policies,
  relationships,
}: LinkedFamilyCompactCardProps) {
  const links = getVisibleFamilyLinks(client.id, clients, relationships);

  if (links.length === 0) return null;

  return (
    <WidgetCard
      title="Linked Family"
      description={`${links.length} linked ${links.length === 1 ? "client" : "clients"}`}
      icon={<UsersRound className="h-4 w-4 text-slate-400" />}
      bodyFlush
    >
      <div className="divide-y divide-slate-100">
        {links.slice(0, 5).map((link) => (
          <Link
            key={link.relationshipId}
            href={clientPath(link.client)}
            className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-50 md:px-6"
          >
            <ClientAvatar
              firstName={link.client.firstName}
              lastName={link.client.lastName}
              size="xs"
            />
            <div className="min-w-0 flex-1">
              <ClientNameDisplay
                firstName={link.client.firstName}
                lastName={link.client.lastName}
                isVip={calculateClientTags(link.client, policies).includes("VIP")}
                size="xs"
              />
              <div className="mt-1">
                <StatusBadge
                  kind="custom"
                  label={link.relationship}
                  className="bg-slate-50 text-slate-500 ring-slate-100"
                />
              </div>
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
          </Link>
        ))}
      </div>
      {links.length > 5 ? (
        <div className="border-t border-slate-100 px-5 py-2 text-[11px] font-medium text-slate-400 md:px-6">
          +{links.length - 5} more in Family Overview
        </div>
      ) : null}
    </WidgetCard>
  );
}
