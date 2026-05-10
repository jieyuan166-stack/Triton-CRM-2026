// app/(dashboard)/policies/page.tsx
"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useData } from "@/components/providers/DataProvider";
import { EmptyState } from "@/components/ui-shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { CARRIER_COLORS } from "@/lib/carrier-colors";
import { formatDate } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/format";

const STATUS_STYLE: Record<string, string> = {
  active: "bg-accent-green/15 text-emerald-700 border-0",
  pending: "bg-accent-amber/15 text-amber-700 border-0",
  lapsed: "bg-accent-red/15 text-red-700 border-0",
};

export default function PoliciesPage() {
  const { policies, getClient } = useData();

  return (
    <>
      <PageHeader
        title="Policies"
        description="All policies across your book"
      />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {policies.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No policies yet"
            description="Policies will appear here when added to a client."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-50/60 border-b border-slate-100">
                  <th className="px-5 md:px-6 py-3">Policy</th>
                  <th className="py-3">Client</th>
                  <th className="py-3 hidden md:table-cell">Type</th>
                  <th className="py-3 text-right">Face Amount</th>
                  <th className="py-3 hidden md:table-cell">Effective</th>
                  <th className="py-3 pr-5 md:pr-6">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {policies.map((p) => {
                  const client = getClient(p.clientId);
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="px-5 md:px-6 py-4">
                        <Link
                          href={`/policies/${p.id}`}
                          className="flex items-center gap-3"
                        >
                          <span
                            className="w-1 h-9 rounded-full shrink-0"
                            style={{ backgroundColor: CARRIER_COLORS[p.carrier] }}
                          />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate">
                              {p.productName}
                            </p>
                            <p className="text-xs text-slate-500">
                              {p.carrier} · {p.policyNumber}
                            </p>
                          </div>
                        </Link>
                      </td>
                      <td className="py-4">
                        {client ? (
                          <Link
                            href={`/clients/${client.id}`}
                            className="text-slate-700 hover:text-slate-900 hover:underline"
                          >
                            {client.firstName} {client.lastName}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-4 hidden md:table-cell text-slate-500">
                        {p.productType}
                      </td>
                      <td className="py-4 text-right font-semibold tabular-nums text-slate-900">
                        {formatCurrency(p.sumAssured)}
                      </td>
                      <td className="py-4 hidden md:table-cell text-slate-500">
                        {formatDate(p.effectiveDate)}
                      </td>
                      <td className="py-4 pr-5 md:pr-6">
                        <Badge className={STATUS_STYLE[p.status]}>
                          {p.status}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
