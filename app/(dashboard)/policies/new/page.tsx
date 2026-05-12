// app/(dashboard)/policies/new/page.tsx
"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { useData } from "@/components/providers/DataProvider";
import { PolicyForm } from "@/components/policies/PolicyForm";
import type { PolicyFormValues } from "@/lib/validators";

function NewPolicyContent() {
  const router = useRouter();
  const params = useSearchParams();
  const presetClient = params.get("clientId") ?? undefined;
  const { createPolicy, getClient } = useData();

  const presetName = presetClient
    ? (() => {
        const c = getClient(presetClient);
        return c ? `${c.firstName} ${c.lastName}` : null;
      })()
    : null;

  function handleSubmit(values: PolicyFormValues) {
    // The Client field is no longer in the form — capture it from the URL
    // (`?clientId=…`) and merge it into the payload here. We override
    // `values.clientId` defensively in case the form's default got out of
    // sync with the URL (e.g. user changed routes mid-edit).
    const clientId = presetClient ?? values.clientId;
    if (!clientId) {
      toast.error("Please choose a client before creating a policy.");
      return;
    }

    // Category drives which fields are surfaced in the form. For Investment,
    // the Financial section is hidden — we backfill defaults for the data
    // model below so the persisted Policy shape stays consistent.
    const isInv = values.category === "Investment";
    const isInvestmentLoan = isInv && !!values.isInvestmentLoan;
    const isCorporateInsurance = !isInv && !!values.isCorporateInsurance;
    const sumAssured = isInv
      ? values.sumAssured ?? values.loanAmount ?? 0
      : values.sumAssured ?? 0;
    const premium = isInv ? 0 : values.premium ?? 0;
    const paymentFrequency = (isInv ? "Monthly" : values.paymentFrequency) as never;
    // Premium Date is only meaningful for Insurance + Annually. Monthly /
    // Investment policies persist undefined.
    const premiumDate =
      !isInv && values.paymentFrequency === "Annual"
        ? values.premiumDate
        : undefined;

    try {
      createPolicy({
        clientId,
        carrier: values.carrier as never,
        category: values.category,
        productType: values.productType as never,
        productName: values.productName?.trim() || values.productType,
        policyNumber: values.policyNumber,
        sumAssured,
        premium,
        paymentFrequency,
        effectiveDate: values.effectiveDate,
        premiumDate,
        status: isInv ? "active" : values.status ?? "active",
        isCorporateInsurance,
        businessName: isCorporateInsurance ? values.businessName : undefined,
        isInvestmentLoan,
        lender: isInvestmentLoan ? (values.lender as never) : undefined,
        loanAmount: isInvestmentLoan ? values.loanAmount : undefined,
        beneficiaries: [],
      });
      toast.success("Policy created");
      router.push(presetClient ? `/clients/${presetClient}` : "/policies");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to create policy."
      );
    }
  }

  return (
    <>
      <Link
        href={presetClient ? `/clients/${presetClient}` : "/policies"}
        className="inline-flex items-center gap-1.5 text-xs text-triton-muted hover:text-triton-text mb-4 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {presetName ? `Back to ${presetName}` : "Back to policies"}
      </Link>

      <PageHeader
        title="New Policy"
        description={
          presetName
            ? `Adding a new policy for ${presetName}`
            : "Add a new policy to a client's portfolio"
        }
      />

      <PolicyForm
        defaultClientId={presetClient}
        submitLabel="Create Policy"
        onSubmit={handleSubmit}
        onCancel={() =>
          router.push(presetClient ? `/clients/${presetClient}` : "/policies")
        }
      />
    </>
  );
}

export default function NewPolicyPage() {
  return (
    <Suspense fallback={null}>
      <NewPolicyContent />
    </Suspense>
  );
}
