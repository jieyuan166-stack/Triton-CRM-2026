// app/(dashboard)/clients/[slug]/page.tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { UserX } from "lucide-react";
import { toast } from "sonner";
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
import { ConfirmDialog } from "@/components/ui-shared/ConfirmDialog";
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
    deleteClient,
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
  const [deleteOpen, setDeleteOpen] = useState(false);

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

  function handleDeleteClient() {
    if (!client) return;
    const ok = deleteClient(client.id);
    if (!ok) {
      toast.error("Could not delete client");
      return;
    }
    toast.success("Client deleted", {
      description: `${client.firstName} ${client.lastName} and associated records were removed.`,
    });
    router.push("/clients");
  }

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
        onDelete={() => setDeleteOpen(true)}
      />

      <nav className="sticky top-16 z-20 -mx-2 mb-4 overflow-x-auto border-y border-slate-100 bg-triton-bg/90 px-2 py-2 backdrop-blur md:mb-6">
        <div className="flex min-w-max items-center gap-2">
          {[
            ["Overview", "#overview"],
            ["Policies", "#policies"],
            ["Family", "#family"],
            ["Communication", "#communication"],
            ["Follow-ups", "#follow-ups"],
          ].map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-white hover:text-[#002147] hover:shadow-sm"
            >
              {label}
            </a>
          ))}
        </div>
      </nav>

      {/* Responsive layout:
          - < xl: stacked for tablet/narrow readability
          - xl: info | policies | follow-ups */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)_minmax(280px,0.8fr)]">
        <div id="overview" className="min-w-0 scroll-mt-28">
          <div className="space-y-4 md:space-y-6">
            <ClientInfoCard client={client} onEdit={() => setEditOpen(true)} />
            <ClientNotesCard client={client} />
          </div>
        </div>
        <div id="policies" className="min-w-0 scroll-mt-28">
          <ClientPoliciesCard clientId={client.id} policies={policies} />
        </div>
        <div id="follow-ups" className="min-w-0 scroll-mt-28">
          <FollowUpTimeline clientId={client.id} followUps={followUps} />
        </div>
      </div>

      {fullClient ? (
        <div id="family" className="mt-4 scroll-mt-28 md:mt-6">
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
      <div id="communication" className="mt-4 scroll-mt-28 md:mt-6">
        <CommunicationLog clientId={client.id} history={fullClient?.emailHistory} />
      </div>

      <NewClientDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        client={fullClient}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Are you absolutely sure?"
        description={
          <>
            This action cannot be undone. This will permanently delete{" "}
            <span className="font-semibold">
              {client.firstName} {client.lastName}
            </span>{" "}
            and all associated policies, follow-ups, relationships, and client data.
          </>
        }
        confirmLabel="Delete"
        onConfirm={handleDeleteClient}
      />
    </>
  );
}
