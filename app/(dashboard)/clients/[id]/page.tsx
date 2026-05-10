// app/(dashboard)/clients/[id]/page.tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { UserX } from "lucide-react";
import { useData } from "@/components/providers/DataProvider";
import { ClientHeader } from "@/components/clients/ClientHeader";
import { ClientInfoCard } from "@/components/clients/ClientInfoCard";
import { ClientPoliciesCard } from "@/components/clients/ClientPoliciesCard";
import { CommunicationLog } from "@/components/clients/CommunicationLog";
import { FollowUpTimeline } from "@/components/clients/FollowUpTimeline";
import { NewClientDialog } from "@/components/clients/NewClientDialog";
import { EmptyState } from "@/components/ui-shared/EmptyState";
import { Button } from "@/components/ui/button";

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const {
    getClient,
    getClientWithStats,
    getPoliciesByClient,
    getFollowUpsByClient,
  } = useData();

  const client = getClientWithStats(id);
  const fullClient = getClient(id);
  const policies = getPoliciesByClient(id);
  const followUps = getFollowUpsByClient(id);

  const [editOpen, setEditOpen] = useState(false);

  // Hydration guard: if id is somehow empty, just stop
  useEffect(() => {
    if (!id) router.replace("/clients");
  }, [id, router]);

  if (!client) {
    return (
      <div className="bg-card rounded-xl border border-slate-200 shadow-sm">
        <EmptyState
          icon={UserX}
          title="Client not found"
          description="This client may have been deleted, or the link is broken."
          action={
            <Button variant="outline" onClick={() => router.push("/clients")}>
              Back to clients
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <>
      <ClientHeader client={client} onEdit={() => setEditOpen(true)} />

      {/* Responsive layout:
          - mobile: stacked
          - md: 2 cols (info | policies) → timeline below full width
          - lg: 3 cols all in one row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="md:col-span-1 lg:col-span-1">
          <ClientInfoCard client={client} />
        </div>
        <div className="md:col-span-1 lg:col-span-1">
          <ClientPoliciesCard clientId={client.id} policies={policies} />
        </div>
        <div className="md:col-span-2 lg:col-span-1">
          <FollowUpTimeline clientId={client.id} followUps={followUps} />
        </div>
      </div>

      {/* Communication Log — full width below the three-up grid so the
          newest send is the first thing visible after Follow-ups, and so
          long bodies have room to expand. Source is fullClient.emailHistory
          (ClientWithStats doesn't carry emailHistory by design). */}
      <div className="mt-4 md:mt-6">
        <CommunicationLog history={fullClient?.emailHistory} />
      </div>

      <NewClientDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        client={fullClient}
      />
    </>
  );
}
