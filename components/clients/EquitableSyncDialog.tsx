"use client";

import { useMemo, useState } from "react";
import { ExternalLink, FileDown, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { useData } from "@/components/providers/DataProvider";
import { useSettings } from "@/components/providers/SettingsProvider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  buildEquitablePreview,
  buildEquitablePreviewCsv,
  parseEquitableJsonText,
  type EquitablePreviewRow,
  type EquitableRawRecord,
} from "@/lib/equitable-sync";
import { formatCurrency } from "@/lib/format";
import type { Client, Policy } from "@/lib/types";

interface EquitableSyncDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
}

function downloadTextFile(filename: string, content: string, type = "text/csv;charset=utf-8;") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function actionLabel(action: EquitablePreviewRow["action"]) {
  switch (action) {
    case "update-policy":
      return "Update Policy";
    case "create-policy":
      return "Add Policy";
    case "create-client-policy":
      return "New Client + Policy";
    case "needs-review":
      return "Needs Review";
  }
}

function actionTone(action: EquitablePreviewRow["action"]) {
  switch (action) {
    case "update-policy":
      return "bg-blue-50 text-blue-700 ring-blue-100";
    case "create-policy":
      return "bg-emerald-50 text-emerald-700 ring-emerald-100";
    case "create-client-policy":
      return "bg-purple-50 text-purple-700 ring-purple-100";
    case "needs-review":
      return "bg-rose-50 text-rose-700 ring-rose-100";
  }
}

function mergeMissingClientFields(client: Client, input: EquitablePreviewRow["clientInput"]): Partial<Client> {
  const patch: Partial<Client> = {};
  if (!client.phone && input.phone) patch.phone = input.phone;
  if (!client.birthday && input.birthday) patch.birthday = input.birthday;
  if (!client.streetAddress && input.streetAddress) patch.streetAddress = input.streetAddress;
  if (!client.city && input.city) patch.city = input.city;
  if (!client.province && input.province) patch.province = input.province;
  if (!client.postalCode && input.postalCode) patch.postalCode = input.postalCode;
  return patch;
}

function policyPatch(input: EquitablePreviewRow["policyInput"]): Partial<Omit<Policy, "id" | "beneficiaries">> {
  return {
    carrier: input.carrier,
    category: input.category,
    productType: input.productType,
    productName: input.productName,
    policyNumber: input.policyNumber,
    sumAssured: input.sumAssured,
    premium: input.premium,
    paymentFrequency: input.paymentFrequency,
    effectiveDate: input.effectiveDate,
    premiumDate: input.premiumDate,
    status: input.status,
  };
}

export function EquitableSyncDialog({ open, onOpenChange }: EquitableSyncDialogProps) {
  const {
    clients,
    policies,
    createClient,
    updateClient,
    createPolicy,
    updatePolicy,
    getSnapshot,
  } = useData();
  const { createBackup } = useSettings();
  const [sourceText, setSourceText] = useState("");
  const [rows, setRows] = useState<EquitablePreviewRow[]>([]);
  const [parseError, setParseError] = useState("");
  const [isApplying, setIsApplying] = useState(false);

  const counts = useMemo(() => {
    return {
      matched: rows.filter((row) => row.action === "create-policy" || row.action === "update-policy").length,
      newClients: rows.filter((row) => row.action === "create-client-policy").length,
      review: rows.filter((row) => row.action === "needs-review").length,
      ready: rows.filter((row) => row.valid).length,
    };
  }, [rows]);

  const handlePreview = () => {
    try {
      const records: EquitableRawRecord[] = parseEquitableJsonText(sourceText);
      const preview = buildEquitablePreview(records, clients, policies);
      setRows(preview);
      setParseError("");
      toast.success(`Prepared ${preview.length} Equitable record${preview.length === 1 ? "" : "s"} for review.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to parse Equitable records.";
      setParseError(message);
      setRows([]);
      toast.error(message);
    }
  };

  const handleExportCsv = () => {
    if (rows.length === 0) {
      toast.error("Load a preview before exporting.");
      return;
    }
    downloadTextFile(
      `equitable-sync-preview-${new Date().toISOString().slice(0, 10)}.csv`,
      buildEquitablePreviewCsv(rows)
    );
    toast.success("Equitable preview CSV exported.");
  };

  const handleApply = async () => {
    const readyRows = rows.filter((row) => row.valid);
    if (readyRows.length === 0) {
      toast.error("There are no ready rows to sync.");
      return;
    }

    setIsApplying(true);
    try {
      await createBackup(getSnapshot());

      let createdClients = 0;
      let createdPolicies = 0;
      let updatedPolicies = 0;
      let enrichedClients = 0;
      const newClientsByKey = new Map<string, Client>();

      readyRows.forEach((row) => {
        let clientId = row.matchedClientId;

        if (row.existingPolicyId) {
          updatePolicy(row.existingPolicyId, policyPatch(row.policyInput));
          updatedPolicies += 1;

          if (row.matchedClientId) {
            const currentClient = clients.find((client) => client.id === row.matchedClientId);
            if (currentClient) {
              const patch = mergeMissingClientFields(currentClient, row.clientInput);
              if (Object.keys(patch).length > 0) {
                updateClient(currentClient.id, patch);
                enrichedClients += 1;
              }
            }
          }
          return;
        }

        if (!clientId) {
          const cached = newClientsByKey.get(row.clientKey);
          if (cached) {
            clientId = cached.id;
          } else {
            const created = createClient(row.clientInput);
            newClientsByKey.set(row.clientKey, created);
            clientId = created.id;
            createdClients += 1;
          }
        } else {
          const currentClient = clients.find((client) => client.id === clientId);
          if (currentClient) {
            const patch = mergeMissingClientFields(currentClient, row.clientInput);
            if (Object.keys(patch).length > 0) {
              updateClient(currentClient.id, patch);
              enrichedClients += 1;
            }
          }
        }

        createPolicy({
          clientId,
          ...row.policyInput,
          beneficiaries: [],
        });
        createdPolicies += 1;
      });

      toast.success(
        `Equitable sync complete: ${createdClients} client${createdClients === 1 ? "" : "s"}, ${createdPolicies} new polic${createdPolicies === 1 ? "y" : "ies"}, ${updatedPolicies} updated.`
      );
      if (enrichedClients) {
        toast.message(`${enrichedClients} matched client${enrichedClients === 1 ? "" : "s"} enriched with missing profile fields.`);
      }
      setRows([]);
      setSourceText("");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Equitable sync failed.");
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border-slate-200 p-0 xl:w-[calc(100vw-5rem)] xl:max-w-[calc(100vw-5rem)]">
        <DialogHeader className="shrink-0 border-b border-slate-100 px-6 py-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <DialogTitle className="text-lg font-semibold text-slate-900">Equitable Policy Sync</DialogTitle>
              <DialogDescription className="mt-2 text-sm text-slate-500">
                Paste extracted Policy Inquiry records as JSON, review matches, then sync only the ready rows. A CRM backup is created before writing.
              </DialogDescription>
            </div>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => window.open("https://advisor.equitable.ca/advisor/en/tools/policy-inquiry/", "_blank", "noopener,noreferrer")}
            >
              Open Equitable Advisor
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(320px,0.45fr)_minmax(520px,1fr)]">
            <div className="space-y-3">
              <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 text-sm text-slate-600">
                <div className="mb-2 flex items-center gap-2 font-semibold text-[#002147]">
                  <ShieldCheck className="h-4 w-4" />
                  Safe sync staging
                </div>
                <p>
                  This does not store Equitable credentials. After manual login, extracted records can be pasted here for a controlled CRM preview.
                </p>
              </div>

              <Textarea
                value={sourceText}
                onChange={(event) => setSourceText(event.target.value)}
                className="min-h-[290px] rounded-2xl border-slate-200 bg-white font-mono text-xs leading-relaxed"
                placeholder={`[
  {
    "Policy Number": "EQ1234567",
    "Owner Name": "Jane Chen",
    "DOB": "1978-04-12",
    "Address": "1200 W 73rd Ave",
    "City": "Vancouver",
    "Province": "BC",
    "Postal Code": "V6P 6G5",
    "Product Name": "Equimax Estate Builder",
    "Face Amount": "$500,000",
    "Premium": "$4,800",
    "Payment Frequency": "Annual",
    "Effective Date": "2018-02-05",
    "Premium Date": "02/05/2026"
  }
]`}
              />

              {parseError ? (
                <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-100">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{parseError}</span>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button className="rounded-xl bg-slate-900 text-white hover:bg-slate-800" onClick={handlePreview}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Build Preview
                </Button>
                <Button variant="outline" className="rounded-xl" onClick={handleExportCsv}>
                  <FileDown className="mr-2 h-4 w-4" />
                  Export Preview CSV
                </Button>
              </div>
            </div>

            <div className="min-w-0 space-y-4">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Ready</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">{counts.ready}</div>
                </div>
                <div className="rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500">Matched</div>
                  <div className="mt-1 text-xl font-semibold text-emerald-800">{counts.matched}</div>
                </div>
                <div className="rounded-2xl bg-purple-50 p-3 ring-1 ring-purple-100">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-purple-500">New Clients</div>
                  <div className="mt-1 text-xl font-semibold text-purple-800">{counts.newClients}</div>
                </div>
                <div className="rounded-2xl bg-rose-50 p-3 ring-1 ring-rose-100">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-500">Review</div>
                  <div className="mt-1 text-xl font-semibold text-rose-800">{counts.review}</div>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="max-h-[56vh] overflow-auto">
                  <table className="min-w-[1200px] border-collapse text-sm">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr className="border-b border-slate-200">
                        {["Action", "Client", "Policy", "Product", "Amount", "Premium", "Dates", "Validation"].map((label) => (
                          <th key={label} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400">
                            No preview yet. Paste extracted records and click Build Preview.
                          </td>
                        </tr>
                      ) : (
                        rows.map((row) => (
                          <tr key={`${row.rowNumber}-${row.policyInput.policyNumber || "missing"}`} className={row.valid ? "bg-white" : "bg-rose-50/35"}>
                            <td className="px-4 py-3 align-top">
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${actionTone(row.action)}`}>
                                {actionLabel(row.action)}
                              </span>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="font-medium text-slate-900">
                                {row.clientInput.firstName} {row.clientInput.lastName}
                              </div>
                              <div className="mt-0.5 text-xs text-slate-500">
                                {row.matchedClientName ? `Matched: ${row.matchedClientName}` : row.clientInput.email}
                              </div>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="font-medium text-slate-900">{row.policyInput.policyNumber || "Missing"}</div>
                              <div className="mt-0.5 text-xs text-slate-500">Equitable Life</div>
                            </td>
                            <td className="max-w-[240px] px-4 py-3 align-top">
                              <div className="whitespace-normal font-medium text-slate-800">{row.policyInput.productName}</div>
                              <div className="mt-0.5 text-xs text-slate-500">
                                {row.policyInput.category} · {row.policyInput.productType}
                              </div>
                            </td>
                            <td className="px-4 py-3 align-top font-finance text-slate-800">
                              {formatCurrency(row.policyInput.sumAssured)}
                            </td>
                            <td className="px-4 py-3 align-top font-finance text-slate-800">
                              {formatCurrency(row.policyInput.premium)}
                            </td>
                            <td className="px-4 py-3 align-top text-xs text-slate-600">
                              <div>Effective: {row.policyInput.effectiveDate}</div>
                              <div>Premium: {row.policyInput.premiumDate ?? "-"}</div>
                            </td>
                            <td className="max-w-[280px] px-4 py-3 align-top">
                              {row.errors.length === 0 && row.warnings.length === 0 ? (
                                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
                                  Ready
                                </span>
                              ) : (
                                <ul className="space-y-1 text-xs">
                                  {row.errors.map((issue, issueIndex) => (
                                    <li key={`e-${issue.field}-${issueIndex}`} className="text-rose-700">
                                      - {issue.message}
                                    </li>
                                  ))}
                                  {row.warnings.map((issue, issueIndex) => (
                                    <li key={`w-${issue.field}-${issueIndex}`} className="text-amber-700">
                                      - {issue.message}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-slate-100 px-6 py-4">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={isApplying}>
            Cancel
          </Button>
          <Button
            className="rounded-xl bg-[#002147] text-white hover:bg-[#001a38]"
            onClick={handleApply}
            disabled={isApplying || counts.ready === 0}
          >
            {isApplying ? "Syncing..." : `Confirm Sync (${counts.ready})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
