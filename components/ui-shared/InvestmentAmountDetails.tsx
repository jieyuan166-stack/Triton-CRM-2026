"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dedupePolicies, getAccruedOngoingInvestmentAmount, getOngoingInvestmentContributionCount } from "@/lib/portfolio-metrics";
import { formatCurrency } from "@/lib/format";
import { displayPolicyNumberWithHash } from "@/lib/policy-number";
import type { Policy } from "@/lib/types";

export function InvestmentAmountDetails({ policies, children }: { policies: Policy[]; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [asOf, setAsOf] = useState(() => new Date());
  const rows = dedupePolicies(policies).filter((policy) => policy.category === "Investment" && policy.status === "active");
  const initial = rows.reduce((sum, policy) => sum + (policy.sumAssured || policy.loanAmount || 0), 0);
  const ongoing = rows.reduce((sum, policy) => sum + getAccruedOngoingInvestmentAmount(policy, asOf), 0);
  return <>
    <button type="button" className="text-left hover:underline decoration-slate-300 underline-offset-4" title="Investment amount details" onClick={() => { setAsOf(new Date()); setOpen(true); }}>{children}</button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-3xl max-h-[85dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>Investment amount details</DialogTitle></DialogHeader>
      <p className="text-xs text-slate-500">As of {asOf.toLocaleDateString("en-CA")}. Ongoing contributions are calculated from the saved schedule; bank receipt is not confirmed.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm font-finance">
        <div>Initial<p className="font-semibold">{formatCurrency(initial)}</p></div>
        <div>Scheduled contributions<p className="font-semibold">{formatCurrency(ongoing)}</p></div>
        <div>Total<p className="font-semibold text-navy">{formatCurrency(initial + ongoing)}</p></div>
      </div>
      <div className="overflow-x-auto"><table className="w-full text-xs text-left min-w-[520px]"><thead className="text-slate-500"><tr><th className="py-2">Policy</th><th className="text-right">Initial</th><th className="text-right">Contributions</th><th className="text-right">Total</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map((policy) => {
          const base = policy.sumAssured || policy.loanAmount || 0;
          const accrued = getAccruedOngoingInvestmentAmount(policy, asOf);
          return <tr key={policy.id}><td className="py-3 max-w-[240px] break-words"><Link href={`/policies/${policy.id}`} className="text-navy hover:underline">{policy.productName || policy.productType}</Link><p className="text-slate-500">{policy.carrier} · {displayPolicyNumberWithHash(policy.policyNumber)}</p>
            <p className="text-slate-500">{policy.ongoingInvestmentFrequency}{policy.ongoingInvestmentFrequency === "Custom" ? " (starting contribution only)" : ""}</p></td>
            <td className="text-right font-finance">{formatCurrency(base)}</td><td className="text-right font-finance">{formatCurrency(accrued)}<p className="text-slate-500">{getOngoingInvestmentContributionCount(policy, asOf)} payments</p></td><td className="text-right font-finance font-semibold">{formatCurrency(base + accrued)}</td></tr>;
        })}</tbody></table></div>
    </DialogContent></Dialog>
  </>;
}
