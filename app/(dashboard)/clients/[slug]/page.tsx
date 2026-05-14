// app/(dashboard)/clients/[slug]/page.tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { UserX } from "lucide-react";
import { useData } from "@/components/providers/DataProvider";
import { ClientHeader } from "@/components/clients/ClientHeader";
import { ClientInfoCard } from "@/components/clients/ClientInfoCard";
import { ClientNotesCard } from "@/components/clients/ClientNotesCard";
import { ClientPoliciesCard } from "@/components/clients/ClientPoliciesCard";
import { CommunicationLog } from "@/components/clients/CommunicationLog";
import { FamilyOverviewCard } from "@/components/clients/FamilyOverviewCard";
import { FollowUpTimeline } from "@/components/clients/FollowUpTimeline";
import { NewClientDialog } from "@/components/clients/NewClientDialog";
import { EmptyState } from "@/components/ui-shared/EmptyState";
import { Button } from "@/components/ui/button";
import { buildClientSlug, clientPath } from "@/lib/client-slug";

export default function ClientDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params.slug;

  const {
    getClient,
    getClientWithStats,
    resolveClientParam,
    getPoliciesByClient,
    getFollowUpsByClient,
    updateClient,
    clients,
    policies: allPolicies,
    relationships,
  } = useData();

  const resolvedClient = resolveClientParam(slug);
  const resolvedId = resolvedClient?.id;
  const client = resolvedId ? getClientWithStats(resolvedId) : undefined;
  const fullClient = resolvedId ? getClient(resolvedId) : undefined;
  const policies = resolvedId ? getPoliciesByClient(resolvedId) : [];
  const followUps = resolvedId ? getFollowUpsByClient(resolvedId) : [];

  const [editOpen, setEditOpen] = useState(false);

  // Hydration guard + backwards compatibility:
  // old /clients/{id} links still resolve, then replace into the professional slug URL.
  useEffect(() => {
    if (!slug) {
      router.replace("/clients");
      return;
    }
    if (!resolvedClient) return;
    const nextSlug = resolvedClient.slug ?? buildClientSlug(resolvedClient);
    if (!resolvedClient.slug) {
      updateClient(resolvedClient.id, { slug: nextSlug });
      return;
    }
    if (slug !== nextSlug) {
      router.replace(clientPath({ id: resolvedClient.id, slug: nextSlug }));
    }
  }, [resolvedClient, router, slug, updateClient]);

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
      <ClientHeader
        client={client}
        reportPolicies={policies}
        onEdit={() => setEditOpen(true)}
      />

      {/* Responsive layout:
          - mobile: stacked
          - md: 2 cols (info | policies) → timeline below full width
          - lg: 3 cols all in one row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="md:col-span-1 lg:col-span-1">
          <div className="space-y-4 md:space-y-6">
            <ClientInfoCard client={client} onEdit={() => setEditOpen(true)} />
            <ClientNotesCard client={client} />
          </div>
        </div>
        <div className="md:col-span-1 lg:col-span-1">
          <ClientPoliciesCard clientId={client.id} policies={policies} />
        </div>
        <div className="md:col-span-2 lg:col-span-1">
          <FollowUpTimeline clientId={client.id} followUps={followUps} />
        </div>
      </div>

      {fullClient ? (
        <div className="mt-4 md:mt-6">
          <FamilyOverviewCard
            client={fullClient}
            clients={clients}
            policies={allPolicies}
            relationships={relationships}
          />
        </div>
      ) : null}

      {/* Communication Log — full width below the three-up grid so the
          newest send is the first thing visible after Follow-ups, and so
          long bodies have room to expand. Source is fullClient.emailHistory
          (ClientWithStats doesn't carry emailHistory by design). */}
      <div className="mt-4 md:mt-6">
        <CommunicationLog clientId={client.id} history={fullClient?.emailHistory} />
      </div>

      <NewClientDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        client={fullClient}
      />
    </>
  );
}
