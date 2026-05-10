"use client";

import { usePathname } from "next/navigation";

import { ClientReportButton } from "@/components/clients/ClientReportButton";
import { useData } from "@/components/providers/DataProvider";

export function ClientReportRouteButton() {
  const pathname = usePathname();
  const { clients, policies } = useData();

  const match = pathname.match(/^\/clients\/([^/]+)$/);
  if (!match) return null;

  const clientId = decodeURIComponent(match[1]);
  const client = clients.find((item) => item.id === clientId);
  if (!client) return null;

  const clientPolicies = policies.filter((policy) => policy.clientId === client.id);

  return (
    <div className="pointer-events-none fixed right-4 top-20 z-30 md:right-8 md:top-24">
      <div className="pointer-events-auto">
        <ClientReportButton client={client} policies={clientPolicies} />
      </div>
    </div>
  );
}
