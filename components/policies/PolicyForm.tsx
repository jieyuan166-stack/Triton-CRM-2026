// components/policies/PolicyForm.tsx
// Shared form for /policies/new and /policies/[id].
//
// Category-aware workflow for Insurance and Investment policies.
"use client";

import { useEffect } from "react";
import { useForm, type FieldErrors, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useData } from "@/components/providers/DataProvider";
import { ClientCombobox } from "@/components/ui-shared/ClientCombobox";
import { CurrencyInput } from "@/components/ui-shared/CurrencyInput";
import { MonthDayPicker } from "@/components/ui-shared/MonthDayPicker";
import { formatMonthDay } from "@/lib/date-utils";
import {
  CARRIERS,
  INSURANCE_PRODUCTS,
  INVESTMENT_PRODUCTS,
  LENDERS,
  PAYMENT_FREQUENCIES,
  PAYMENT_FREQUENCY_LABELS,
} from "@/lib/types";
import {
  policyFormSchema,
  toCurrencyNumber,
  type PolicyFormValues,
} from "@/lib/validators";

// === Section helper ===
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-xl border border-slate-200 shadow-sm">
      <div className="px-5 md:px-6 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </h3>
        {description ? (
          <p className="text-xs text-triton-muted mt-0.5">{description}</p>
        ) : null}
      </div>
      <div className="px-5 md:px-6 py-5">{children}</div>
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-accent-red mt-1">{message}</p>;
}

/** Default Loan Amount the spec wants populated when the toggle is first
 *  enabled. Users can edit it freely after that. */
const DEFAULT_LOAN_AMOUNT = 100_000;

function makeDefaults(defaultClientId?: string): Partial<PolicyFormValues> {
  // Every field gets an explicit, non-undefined default. Selects must start
  // as a string (never undefined) so the underlying base-ui Select stays in
  // controlled mode for the entire lifetime of the form. CurrencyInput
  // fields keep `undefined` because that component is uncontrolled-by-design
  // for numeric inputs and renders a blank box when the value is missing.
  return {
    clientId: defaultClientId ?? "",
    category: "Insurance",
    carrier: "Manulife",
    productType: "Whole Life",
    productName: "",
    policyNumber: "",
    sumAssured: undefined as unknown as number,
    premium: undefined as unknown as number,
    paymentFrequency: "Annual",
    effectiveDate: new Date().toISOString().slice(0, 10),
    premiumDate: "",
    status: "active",
    isInvestmentLoan: false,
    lender: "" as never,
    loanAmount: undefined,
    isCorporateInsurance: false,
    businessName: "",
    isJoint: false,
    jointWithClientId: "",
  };
}

export interface PolicyFormProps {
  initialValues?: PolicyFormValues;
  /** Captured from the URL (`?clientId=`) on /policies/new when the flow
   *  starts from a client profile. If absent (e.g. Dashboard Quick Add), the
   *  form displays a Client picker so the policy can still be attached. */
  defaultClientId?: string;
  submitLabel?: string;
  onSubmit: (values: PolicyFormValues) => void;
  onCancel?: () => void;
}

export function PolicyForm({
  initialValues,
  defaultClientId,
  submitLabel = "Save",
  onSubmit,
  onCancel,
}: PolicyFormProps) {
  const { clients } = useData();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<PolicyFormValues>({
    resolver: zodResolver(policyFormSchema),
    defaultValues:
      initialValues ?? (makeDefaults(defaultClientId) as PolicyFormValues),
    mode: "onBlur",
  });

  const category = watch("category");
  const effectiveDate = watch("effectiveDate");
  const paymentFrequency = watch("paymentFrequency");
  const premiumDate = watch("premiumDate");
  const isInvestmentLoan = watch("isInvestmentLoan") ?? false;
  const isCorporateInsurance = watch("isCorporateInsurance") ?? false;
  const isJoint = watch("isJoint") ?? false;
  const loanAmount = watch("loanAmount");

  const isInvestment = category === "Investment";
  const isInsurance = category === "Insurance";
  const showPremiumDate = isInsurance && paymentFrequency === "Annual";
  const showClientPicker = !defaultClientId && !initialValues?.clientId;
  const ownerClientId = watch("clientId") ?? "";
  const jointPartnerOptions = clients.filter((client) => client.id !== ownerClientId);

  // Product Type options derived from current Category. Recomputed each
  // render — cheap, and avoids stale lists when category flips.
  const productTypeOptions = isInvestment
    ? INVESTMENT_PRODUCTS
    : INSURANCE_PRODUCTS;

  useEffect(() => {
    if (initialValues) reset(initialValues);
  }, [initialValues, reset]);

  // When the user is on Insurance + Annually, auto-sync Premium Date to the
  // month/day of the current Effective Date whenever either driver changes.
  // The user can then manually pick a different date — the override survives
  // until the next Effective Date / frequency change.
  useEffect(() => {
    if (showPremiumDate && effectiveDate) {
      // ISO "YYYY-MM-DD" → canonical "MM-DD"
      const mmdd = effectiveDate.slice(5, 10);
      if (/^\d{2}-\d{2}$/.test(mmdd)) {
        setValue("premiumDate", mmdd, { shouldValidate: false });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveDate, showPremiumDate]);

  // When Category flips:
  //   1. Clear Product Type if the current pick doesn't belong to the new
  //      category's list — forces a re-pick so we never persist a "Whole
  //      Life" Investment policy or similar mismatch.
  //   2. Reset the now-irrelevant cross-category fields so we don't carry
  //      stale Investment-loan data into an Insurance save (or vice-versa).
  //   3. Call clearErrors() on the same set so any stale validation messages
  //      from a prior submit attempt don't keep blocking the form. This is
  //      the fix for "Lender: Invalid enum value, received '' " when the
  //      user has switched back to Insurance — the field is hidden, but RHF
  //      kept the error in formState until we explicitly clear it.
  useEffect(() => {
    const current = watch("productType");
    const allowed = (
      category === "Investment" ? INVESTMENT_PRODUCTS : INSURANCE_PRODUCTS
    ) as readonly string[];
    if (current && !allowed.includes(current)) {
      setValue("productType", "", { shouldValidate: false });
    }

    if (category === "Insurance") {
      // Wipe Investment-only fields back to safe blanks. Empty string for
      // the lender Select keeps it controlled.
      setValue("isInvestmentLoan", false, { shouldValidate: false });
      setValue("lender", "" as never, { shouldValidate: false });
      setValue("loanAmount", undefined as never, { shouldValidate: false });
    } else {
      // Wipe Insurance-only fields. Initial Investment reuses sumAssured, so
      // keep it under Investment; Corporate Insurance doesn't render there.
      setValue("isCorporateInsurance", false, { shouldValidate: false });
      setValue("businessName", "", { shouldValidate: false });
      setValue("premium", undefined as never, { shouldValidate: false });
    }

    clearErrors([
      "productType",
      "lender",
      "loanAmount",
      "businessName",
      "sumAssured",
      "premium",
      "paymentFrequency",
      "premiumDate",
    ]);
    // We intentionally only react to category changes, not to every field
    // edit inside this effect. The watch() above is a one-time read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // When Investment Loan is first enabled, pre-fill Loan Amount with the
  // spec default ($100,000). Don't override an existing user-entered value.
  // When the toggle is turned OFF, clear any stale errors from the now-hidden
  // lender / loanAmount fields so a previous failed submit doesn't keep
  // blocking the form.
  useEffect(() => {
    if (isInvestmentLoan) {
      const current = loanAmount;
      const syncedAmount =
        typeof current === "number" && current > 0
          ? current
          : DEFAULT_LOAN_AMOUNT;

      if (current !== syncedAmount) {
        setValue("loanAmount", DEFAULT_LOAN_AMOUNT, { shouldValidate: false });
      }
      setValue("sumAssured", syncedAmount as never, { shouldValidate: true });
    } else {
      clearErrors(["lender", "loanAmount"]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInvestmentLoan, loanAmount]);

  useEffect(() => {
    if (!isJoint) {
      setValue("jointWithClientId", "", { shouldValidate: false });
      clearErrors("jointWithClientId");
      return;
    }

    const current = watch("jointWithClientId");
    if (current && current === ownerClientId) {
      setValue("jointWithClientId", "", { shouldValidate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isJoint, ownerClientId]);

  // Surface validation failures in the console — without this, a Submit click
  // with one bad field can look like "nothing happened" if the bad field is
  // currently hidden by a conditional (e.g. lender on Investment-loan).
  const onInvalid = (errs: FieldErrors<PolicyFormValues>) => {
     
    console.warn("[PolicyForm] submit blocked by validation:", errs);
  };
  // Defensive currency coercion at the submit boundary. CurrencyInput already
  // emits numbers, but any bypass (paste, programmatic setValue with a string,
  // future field that goes through register() instead of CurrencyInput) would
  // otherwise leave "$1,500,000" in the payload. Strip "$"/","/spaces here so
  // the parent's onSubmit always receives clean numbers.
  const onValid: SubmitHandler<PolicyFormValues> = (values) => {
    const cleaned = {
      ...values,
      sumAssured: toCurrencyNumber(values.sumAssured) as never,
      premium: toCurrencyNumber(values.premium) as never,
      loanAmount: toCurrencyNumber(values.loanAmount) as never,
    } as PolicyFormValues;
    onSubmit(cleaned);
  };

  // Flatten the errors map so we can render a one-shot banner when submit is
  // blocked. We show the labels rather than the raw field keys so non-devs
  // get something readable.
  const FIELD_LABELS: Record<string, string> = {
    clientId: "Client",
    category: "Category",
    carrier: "Carrier",
    productType: "Product Type",
    policyNumber: "Policy Number",
    sumAssured: isInvestment ? "Initial Investment" : "Death Benefit",
    premium: "Premium",
    paymentFrequency: "Payment Frequency",
    effectiveDate: "Effective Date",
    premiumDate: "Premium Date",
    lender: "Lender",
    loanAmount: "Loan Amount",
    businessName: "Business Name",
    jointWithClientId: "Joint With",
  };
  const errorList = Object.entries(errors)
    .filter(([, e]) => !!e?.message)
    .map(([k, e]) => ({
      field: FIELD_LABELS[k] ?? k,
      message: (e as { message?: string }).message ?? "Invalid",
    }));

  return (
    <form onSubmit={handleSubmit(onValid, onInvalid)} className="space-y-6">
      {/* === Section 1: Basic === */}
      <Section title="Basic" description="Carrier, product, and identifiers">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {showClientPicker ? (
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="clientId">
                Client <span className="text-accent-red">*</span>
              </Label>
              <Select
                value={watch("clientId") ?? ""}
                onValueChange={(v) =>
                  setValue("clientId", v ?? "", { shouldValidate: true })
                }
              >
                <SelectTrigger id="clientId" className="w-full">
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.firstName} {client.lastName}
                      {client.email ? ` · ${client.email}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {clients.length === 0 ? (
                <p className="text-xs text-triton-muted">
                  Create a client before adding a policy.
                </p>
              ) : null}
              <FieldError message={errors.clientId?.message} />
            </div>
          ) : null}

          {/* Category */}
          <div className="space-y-1.5">
            <Label htmlFor="category">
              Category <span className="text-accent-red">*</span>
            </Label>
            <Select
              value={watch("category") ?? ""}
              onValueChange={(v) =>
                setValue("category", v as "Insurance" | "Investment", {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger id="category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Insurance">Insurance</SelectItem>
                <SelectItem value="Investment">Investment</SelectItem>
              </SelectContent>
            </Select>
            <FieldError message={errors.category?.message as string} />
          </div>

          {/* Carrier */}
          <div className="space-y-1.5">
            <Label htmlFor="carrier">
              Carrier <span className="text-accent-red">*</span>
            </Label>
            <Select
              value={watch("carrier") ?? ""}
              onValueChange={(v) =>
                setValue("carrier", v as never, { shouldValidate: true })
              }
            >
              <SelectTrigger id="carrier" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CARRIERS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={errors.carrier?.message as string} />
          </div>

          {/* Product Type — options driven by Category */}
          <div className="space-y-1.5">
            <Label htmlFor="productType">
              Product Type <span className="text-accent-red">*</span>
            </Label>
            <Select
              value={watch("productType") ?? ""}
              onValueChange={(v) =>
                setValue("productType", (v ?? "") as string, {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger id="productType" className="w-full">
                <SelectValue placeholder={`Select ${category.toLowerCase()} product`} />
              </SelectTrigger>
              <SelectContent>
                {productTypeOptions.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={errors.productType?.message as string} />
          </div>

          {/* Product Name — optional display name, especially useful for
              imported carrier-specific products like GIF Select / Performax. */}
          <div className="space-y-1.5">
            <Label htmlFor="productName">Product Name</Label>
            <Input
              id="productName"
              placeholder="Optional product display name"
              {...register("productName")}
            />
            <FieldError message={errors.productName?.message as string} />
          </div>

          {/* Status (Insurance) — replaced by Investment Loan toggle for Investment */}
          {isInvestment ? (
            <div className="space-y-1.5">
              <Label htmlFor="isInvestmentLoan">Investment Loan</Label>
              <label
                htmlFor="isInvestmentLoan"
                className="flex items-center gap-2.5 h-9 px-3 rounded-md border border-slate-200 bg-white cursor-pointer hover:bg-slate-50 transition-colors"
              >
                <Checkbox
                  id="isInvestmentLoan"
                  checked={isInvestmentLoan}
                  onCheckedChange={(c) =>
                    setValue("isInvestmentLoan", c === true, {
                      shouldValidate: true,
                    })
                  }
                />
                <span className="text-sm text-slate-700">
                  Funded by an investment loan
                </span>
              </label>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <Select
                value={(watch("status") ?? "active") || "active"}
                onValueChange={(v) =>
                  setValue("status", v as "active" | "pending" | "lapsed", {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger id="status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="lapsed">Lapsed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="isJoint">Joint Account</Label>
            <label
              htmlFor="isJoint"
              className="flex items-center gap-2.5 h-9 px-3 rounded-md border border-slate-200 bg-white cursor-pointer hover:bg-slate-50 transition-colors"
            >
              <Checkbox
                id="isJoint"
                checked={isJoint}
                onCheckedChange={(c) =>
                  setValue("isJoint", c === true, {
                    shouldValidate: true,
                  })
                }
              />
              <span className="text-sm text-slate-700">
                Shared with another client
              </span>
            </label>
          </div>

          {isJoint ? (
            <div className="space-y-1.5">
              <Label htmlFor="jointWithClientId">
                Joint With <span className="text-accent-red">*</span>
              </Label>
              <ClientCombobox
                clients={jointPartnerOptions}
                value={watch("jointWithClientId") ?? ""}
                onChange={(v) =>
                  setValue("jointWithClientId", v ?? "", {
                    shouldValidate: true,
                  })
                }
                placeholder="Search joint partner"
                emptyText="No matching clients"
              />
              {jointPartnerOptions.length === 0 ? (
                <p className="text-xs text-triton-muted">
                  Add another client before creating a joint policy.
                </p>
              ) : null}
              <FieldError message={errors.jointWithClientId?.message} />
            </div>
          ) : null}

          {isInvestment ? (
            <div className="space-y-1.5">
              <Label htmlFor="initialInvestment">
                Initial Investment <span className="text-accent-red">*</span>
              </Label>
              <CurrencyInput
                id="initialInvestment"
                value={watch("sumAssured")}
                onValueChange={(n) =>
                  setValue("sumAssured", n as never, { shouldValidate: true })
                }
                disabled={isInvestmentLoan}
              />
              {isInvestmentLoan ? (
                <p className="text-[11px] text-triton-muted">
                  Matches the investment loan amount automatically.
                </p>
              ) : null}
              <FieldError message={errors.sumAssured?.message} />
            </div>
          ) : null}

          {/* Policy Number */}
          <div className="space-y-1.5">
            <Label htmlFor="policyNumber">
              Policy Number <span className="text-accent-red">*</span>
            </Label>
            <Input
              id="policyNumber"
              placeholder="e.g. SUN-771204"
              {...register("policyNumber")}
            />
            <FieldError message={errors.policyNumber?.message} />
          </div>
        </div>

        {/* Corporate-insurance extras — Insurance only.
            Toggle + conditional Business Name input live in the Basic section
            so policy-holder context stays grouped with identifiers. */}
        {isInsurance ? (
          <div className="mt-5 pt-5 border-t border-slate-100 space-y-4">
            <label
              htmlFor="isCorporateInsurance"
              className="flex items-center gap-2.5 cursor-pointer select-none"
            >
              <Checkbox
                id="isCorporateInsurance"
                checked={isCorporateInsurance}
                onCheckedChange={(c) =>
                  setValue("isCorporateInsurance", c === true, {
                    shouldValidate: true,
                  })
                }
              />
              <span className="text-sm font-medium text-slate-700">
                Corporate Insurance
              </span>
              <span className="text-xs text-slate-400">
                Held by a business entity
              </span>
            </label>

            {isCorporateInsurance ? (
              <div className="space-y-1.5">
                <Label htmlFor="businessName">
                  Business Name <span className="text-accent-red">*</span>
                </Label>
                <Input
                  id="businessName"
                  placeholder="e.g. Triton Wealth Management Corp."
                  {...register("businessName")}
                />
                <FieldError message={errors.businessName?.message} />
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Investment-loan extras — Basic-section neighbours of the toggle.
            Renders only when Investment + Investment Loan checkbox enabled. */}
        {isInvestment && isInvestmentLoan ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5 pt-5 border-t border-slate-100">
            <div className="space-y-1.5">
              <Label htmlFor="lender">
                Lender <span className="text-accent-red">*</span>
              </Label>
              <Select
                value={watch("lender") ?? ""}
                onValueChange={(v) =>
                  setValue("lender", (v ?? "") as never, {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger id="lender" className="w-full">
                  <SelectValue placeholder="Select lender" />
                </SelectTrigger>
                <SelectContent>
                  {LENDERS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.lender?.message as string} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="loanAmount">
                Loan Amount <span className="text-accent-red">*</span>
              </Label>
              <CurrencyInput
                id="loanAmount"
                value={watch("loanAmount")}
                onValueChange={(n) => {
                  setValue("loanAmount", n as never, { shouldValidate: true });
                  setValue("sumAssured", n as never, { shouldValidate: true });
                }}
              />
              <FieldError message={errors.loanAmount?.message} />
            </div>
          </div>
        ) : null}
      </Section>

      {/* === Section 2: Financial — Insurance only ===
          Investment policies surface Initial Investment in Basic. Premium
          and Payment Frequency remain Insurance-only. */}
      {!isInvestment ? (
      <Section title="Financial" description="Death benefit, premium, and frequency">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="sumAssured">
              Death Benefit <span className="text-accent-red">*</span>
            </Label>
            <CurrencyInput
              id="sumAssured"
              value={watch("sumAssured")}
              onValueChange={(n) =>
                setValue("sumAssured", n as never, { shouldValidate: true })
              }
            />
            <FieldError message={errors.sumAssured?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="premium">
              Premium <span className="text-accent-red">*</span>
            </Label>
            <CurrencyInput
              id="premium"
              value={watch("premium")}
              onValueChange={(n) =>
                setValue("premium", n as never, { shouldValidate: true })
              }
            />
            <FieldError message={errors.premium?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="paymentFrequency">
              Payment Frequency <span className="text-accent-red">*</span>
            </Label>
            <Select
              value={watch("paymentFrequency") ?? ""}
              onValueChange={(v) =>
                setValue("paymentFrequency", v as never, {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger id="paymentFrequency" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_FREQUENCIES.map((f) => (
                  <SelectItem key={f} value={f}>
                    {PAYMENT_FREQUENCY_LABELS[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

      </Section>
      ) : null}

      {/* === Section 3: Key Dates === */}
      <Section title="Key Dates">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="effectiveDate">
              Effective Date <span className="text-accent-red">*</span>
            </Label>
            <Input
              id="effectiveDate"
              type="date"
              {...register("effectiveDate")}
            />
            <FieldError message={errors.effectiveDate?.message} />
          </div>

          {/* Premium Date — Insurance + Annually only. Year-less by design.
              Stored as "MM-DD"; UI never surfaces the year. */}
          {showPremiumDate ? (
            <div className="space-y-1.5">
              <Label htmlFor="premiumDate">
                Premium Date <span className="text-accent-red">*</span>
              </Label>
              <MonthDayPicker
                id="premiumDate"
                value={premiumDate}
                onChange={(v) =>
                  setValue("premiumDate", v ?? "", { shouldValidate: true })
                }
              />
              <p className="text-[11px] text-triton-muted">
                {premiumDate
                  ? `Will display as ${formatMonthDay(premiumDate)}`
                  : "Defaults to the Effective Date anniversary."}
              </p>
              <FieldError message={errors.premiumDate?.message} />
            </div>
          ) : null}
        </div>
      </Section>

      {/* Validation summary — only renders after the user has tried to submit
          at least once (RHF only populates `errors` on submit/blur).  Lists
          every field blocking the submit so a hidden conditional field
          (e.g. Lender when Investment-loan is toggled) can't make the click
          look like "nothing happened". */}
      {errorList.length > 0 ? (
        <div className="rounded-md border border-accent-red/30 bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
          <p className="font-medium mb-1">
            Please fix the following before saving:
          </p>
          <ul className="list-disc pl-5 space-y-0.5">
            {errorList.map((e) => (
              <li key={e.field}>
                <span className="font-medium">{e.field}:</span> {e.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* === Footer actions === */}
      <div className="flex justify-end gap-2 pt-2">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button
          type="submit"
          disabled={isSubmitting}
          className="bg-navy hover:bg-navy/90 text-white"
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
