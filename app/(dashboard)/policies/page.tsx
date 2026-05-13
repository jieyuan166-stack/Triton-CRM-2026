// app/(dashboard)/policies/page.tsx
"use client";

import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useData } from "@/components/providers/DataProvider";
import { EmptyState } from "@/components/ui-shared/EmptyState";
import { PolicyDataCard } from "@/components/ui-shared/PolicyDataCard";
import { buttonVariants } from "@/components/ui/button";
import { calculateClientTags } from "@/lib/client-tags";
import { cn } from "@/lib/utils";

export default function PoliciesPage() {
  const { policies, getClient } = useData();

  return (
    <>
      <PageHeader
        title="Policies"
        description="All policies across your book"
        action={
          <Link
            href="/policies/new"
            className={cn(buttonVariants({ size: "sm" }), "bg-navy text-white hover:bg-navy/90")}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Policy
          </Link>
        }
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {policies.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No policies yet"
            description="Policies will appear here when added to a client."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {policies.map((p) => {
              const client = getClient(p.clientId);
              return (
                <li key={p.id}>
                  <PolicyDataCard
                    policy={p}
                    href={`/policies/${p.id}`}
                    owner={client}
                    ownerIsVip={client ? calculateClientTags(client, policies).includes("VIP") : false}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
