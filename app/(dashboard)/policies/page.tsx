// app/(dashboard)/policies/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useData } from "@/components/providers/DataProvider";
import { EmptyState } from "@/components/ui-shared/EmptyState";
import { PolicyDataCard } from "@/components/ui-shared/PolicyDataCard";
import { buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { calculateClientTags } from "@/lib/client-tags";
import { CARRIERS, type Carrier, type Policy } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function PoliciesPage() {
  return (
    <Suspense fallback={null}>
      <PoliciesContent />
    </Suspense>
  );
}

function parseCarrier(value: string | null): Carrier | "all" {
  return value && (CARRIERS as readonly string[]).includes(value)
    ? (value as Carrier)
    : "all";
}

function PoliciesContent() {
  const searchParams = useSearchParams();
  const { policies, getClient } = useData();
  const carrierFromUrl = parseCarrier(searchParams.get("carrier"));
  const [statusFilter, setStatusFilter] = useState<Policy["status"] | "all">("all");
  const [carrierFilter, setCarrierFilter] = useState<Carrier | "all">(carrierFromUrl);

  useEffect(() => {
    setCarrierFilter(carrierFromUrl);
  }, [carrierFromUrl]);

  const visiblePolicies = useMemo(
    () =>
      policies.filter(
        (policy) =>
          (statusFilter === "all" || policy.status === statusFilter) &&
          (carrierFilter === "all" || policy.carrier === carrierFilter)
      ),
    [carrierFilter, policies, statusFilter]
  );

  return (
    <>
      <PageHeader
        title="Policies"
        description={
          carrierFilter === "all"
            ? "All policies across your book"
            : `Showing ${carrierFilter} policies`
        }
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Carrier
              </span>
              <Select
                value={carrierFilter}
                onValueChange={(value) =>
                  setCarrierFilter(value as Carrier | "all")
                }
              >
                <SelectTrigger className="h-9 w-[165px] bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Carriers</SelectItem>
                  {CARRIERS.map((carrier) => (
                    <SelectItem key={carrier} value={carrier}>
                      {carrier}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Status
              </span>
              <Select
                value={statusFilter}
                onValueChange={(value) =>
                  setStatusFilter(value as Policy["status"] | "all")
                }
              >
                <SelectTrigger className="h-9 w-[145px] bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="lapsed">Lapsed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Link
              href="/policies/new"
              className={cn(buttonVariants({ size: "sm" }), "bg-navy text-white hover:bg-navy/90")}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Policy
            </Link>
          </div>
        }
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {policies.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No policies yet"
            description="Policies will appear here when added to a client."
          />
        ) : visiblePolicies.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No matching policies"
            description="Try another carrier or status filter."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {visiblePolicies.map((p) => {
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
