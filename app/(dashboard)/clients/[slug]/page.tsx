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
import { ActivityTimeline } from "@/components/clients/ActivityTimeline";
import { FamilyOverviewCard } from "@/components/clients/FamilyOverviewCard";
import { LinkedFamilyCompactCard } from "@/components/clients/LinkedFamilyCompactCard";
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
            ["Info", "#info"],
            ["Policies", "#policies"],
            ["Family", "#family"],
            ["Activity", "#activity"],
          ].map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-card hover:text-navy hover:shadow-sm"
            >
              {label}
            </a>
          ))}
        </div>
      </nav>

      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside id="info" className="min-w-0 scroll-mt-28">
          <div className="space-y-4 md:space-y-6 xl:sticky xl:top-28">
            <ClientInfoCard client={client} onEdit={() => setEditOpen(true)} />
            <ClientNotesCard client={client} />
            {fullClient ? (
              <LinkedFamilyCompactCard
                client={fullClient}
                clients={clients}
                policies={allPolicies}
                relationships={relationships}
              />
            ) : null}
            <ActivityTimeline
              clientId={client.id}
              followUps={followUps}
              history={fullClient?.emailHistory}
            />
          </div>
        </aside>

        <main className="min-w-0 space-y-4 md:space-y-6">
          <section id="policies" className="scroll-mt-28">
            <ClientPoliciesCard clientId={client.id} policies={policies} />
          </section>

          {fullClient ? (
            <section id="family" className="scroll-mt-28">
              <FamilyOverviewCard
                client={fullClient}
                clients={clients}
                policies={allPolicies}
                relationships={relationships}
              />
            </section>
          ) : null}
        </main>
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
