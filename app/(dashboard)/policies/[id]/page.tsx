// app/(dashboard)/policies/[id]/page.tsx
"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, FileX, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useData } from "@/components/providers/DataProvider";
import { PolicyForm } from "@/components/policies/PolicyForm";
import { Button } from "@/components/ui/button";
import { ClientAvatar } from "@/components/ui-shared/ClientAvatar";
import { ClientNameDisplay } from "@/components/ui-shared/ClientNameDisplay";
import { EmptyState } from "@/components/ui-shared/EmptyState";
import { calculateClientTags } from "@/lib/client-tags";
import { clientPath } from "@/lib/client-slug";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PolicyFormValues } from "@/lib/validators";

export default function PolicyDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const { getPolicy, getClient, updatePolicy, deletePolicy, policies } = useData();
  const policy = getPolicy(id);
  const client = policy ? getClient(policy.clientId) : null;
  const clientIsVip = client ? calculateClientTags(client, policies).includes("VIP") : false;

  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!policy) {
    return (
      <div className="bg-card rounded-xl border border-slate-200 shadow-sm">
        <EmptyState
          icon={FileX}
          title="Policy not found"
          description="This policy may have been deleted, or the link is broken."
          action={
            <Button variant="outline" onClick={() => router.push("/policies")}>
              Back to policies
            </Button>
          }
        />
      </div>
    );
  }

  // Map Policy → form values
  const initialValues: PolicyFormValues = {
    clientId: policy.clientId,
    category: policy.category,
    carrier: policy.carrier,
    productType: policy.productType,
    productName: policy.productName ?? "",
    policyNumber: policy.policyNumber,
    sumAssured:
      policy.category === "Investment" && policy.sumAssured <= 0
        ? policy.loanAmount
        : policy.sumAssured,
    premium: policy.premium,
    paymentFrequency: policy.paymentFrequency,
    effectiveDate: policy.effectiveDate,
    premiumDate: policy.premiumDate ?? "",
    status: policy.status,
    isInvestmentLoan: !!policy.isInvestmentLoan,
    lender: (policy.lender ?? "") as never,
    loanAmount: policy.loanAmount,
    isCorporateInsurance: !!policy.isCorporateInsurance,
    businessName: policy.businessName ?? "",
    isJoint: !!policy.isJoint,
    jointWithClientId: policy.jointWithClientId ?? "",
    policyOwnerName: policy.policyOwnerName ?? "",
    policyOwnerClientId: policy.policyOwnerClientId ?? "",
    insuredPersons: policy.insuredPersons ?? [],
  };

  function handleSubmit(values: PolicyFormValues) {
    const isInv = values.category === "Investment";
    const isInvestmentLoan = isInv && !!values.isInvestmentLoan;
    const isCorporateInsurance = !isInv && !!values.isCorporateInsurance;
    const isJoint = !!values.isJoint && !!values.jointWithClientId;
    const sumAssured = isInv
      ? values.sumAssured ?? values.loanAmount ?? 0
      : values.sumAssured ?? 0;
    const premium = isInv ? 0 : values.premium ?? 0;
    const paymentFrequency = (isInv ? "Monthly" : values.paymentFrequency) as never;
    const premiumDate =
      !isInv && values.paymentFrequency === "Annual"
        ? values.premiumDate
        : undefined;

    updatePolicy(id, {
      clientId: values.clientId,
      category: values.category,
      carrier: values.carrier as never,
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
      isJoint,
      jointWithClientId: isJoint ? values.jointWithClientId : undefined,
      policyOwnerName: values.policyOwnerName?.trim() || undefined,
      policyOwnerClientId: values.policyOwnerClientId || undefined,
      insuredPersons: values.insuredPersons,
    });
    if (client) router.push(clientPath(client));
    else router.push("/policies");
  }

  function handleDelete() {
    deletePolicy(id);
    if (client) router.push(clientPath(client));
    else router.push("/policies");
  }

  return (
    <>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-triton-muted mb-4">
        <Link href="/policies" className="hover:text-triton-text inline-flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" />
          Policies
        </Link>
        <span className="text-slate-300">/</span>
        {client ? (
          <Link
            href={clientPath(client)}
            className="hover:text-triton-text"
          >
            {client.firstName} {client.lastName}
          </Link>
        ) : (
          <span>—</span>
        )}
        <span className="text-slate-300">/</span>
        <span className="text-triton-text font-medium truncate max-w-[12rem]">
          {policy.productName}
        </span>
      </nav>

      <PageHeader
        title={policy.productName}
        description={`${policy.carrier} · ${policy.policyNumber}${client ? ` · ${client.firstName} ${client.lastName}` : ""}`}
        action={
          <Button
            variant="outline"
            className="text-accent-red border-accent-red/30 hover:bg-accent-red/10 hover:text-accent-red"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Delete
          </Button>
        }
      />

      {client ? (
        <Link
          href={clientPath(client)}
          className="mb-6 flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-100 hover:bg-blue-50/30 hover:shadow-md"
        >
          <ClientAvatar
            firstName={client.firstName}
            lastName={client.lastName}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Current Client
            </p>
            <div className="mt-1">
              <ClientNameDisplay
                firstName={client.firstName}
                lastName={client.lastName}
                isVip={clientIsVip}
                size="md"
              />
            </div>
            {client.email ? (
              <p className="mt-1 truncate text-sm text-slate-500">{client.email}</p>
            ) : null}
          </div>
          <span className="hidden rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-100 sm:inline-flex">
            View Client
          </span>
        </Link>
      ) : null}

      <PolicyForm
        initialValues={initialValues}
        submitLabel="Save Changes"
        onSubmit={handleSubmit}
        onCancel={() =>
          router.push(client ? clientPath(client) : "/policies")
        }
      />

      {/* Delete confirmation */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this policy?</DialogTitle>
            <DialogDescription>
              {policy.productName} ({policy.policyNumber}) will be permanently
              removed from {client ? `${client.firstName} ${client.lastName}` : "this client"}
              &apos;s portfolio. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-accent-red hover:bg-accent-red/90 text-white"
              onClick={handleDelete}
            >
              Delete Policy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
