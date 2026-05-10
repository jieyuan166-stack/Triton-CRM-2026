"use client";

import { useMemo, useRef, useState } from "react";
import Papa from "@/lib/papaparse";
import { Download, FileSpreadsheet, Plus, Upload } from "lucide-react";
import { toast } from "sonner";

import { ClientsDataTable } from "@/components/clients/ClientsDataTable";
import { useData } from "@/components/providers/DataProvider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildClientsExportCsv,
  buildCsvTemplate,
  parseImportedRows,
  type ImportRowError,
  type ParsedImportProduct,
  type ParsedImportRow,
} from "@/lib/clients-csv";
import type { Client } from "@/lib/types";

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

function applyImportSafeguards(rows: ParsedImportRow[], existingClients: Client[]) {
  const existingEmails = new Set(existingClients.map((client) => client.email.toLowerCase()));
  const seenEmails = new Set<string>();

  return rows.map((row) => {
    const extraErrors: ImportRowError[] = [];
    const email = row.mappedClient.email.toLowerCase();

    if (existingEmails.has(email)) {
      extraErrors.push({ field: "email", message: "Email already exists in Triton CRM." });
    }

    if (seenEmails.has(email)) {
      extraErrors.push({ field: "email", message: "Duplicate email inside the import file." });
    } else {
      seenEmails.add(email);
    }

    return {
      ...row,
      errors: [...row.errors, ...extraErrors],
      valid: row.errors.length + extraErrors.length === 0,
    };
  });
}

function badgeTone(valid: boolean) {
  return valid
    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
    : "bg-rose-50 text-rose-700 ring-1 ring-rose-100";
}

export default function ClientsPage() {
  const { clients, policies, createClient, createPolicy, updateClient } = useData();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRows, setPreviewRows] = useState<ParsedImportRow[]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [mappingSummary, setMappingSummary] = useState<Record<string, string>>({});
  const [isImporting, setIsImporting] = useState(false);

  const validRows = useMemo(() => previewRows.filter((row) => row.valid), [previewRows]);

  const handleExportCsv = () => {
    const csv = buildClientsExportCsv(clients, policies);
    downloadTextFile(`triton-clients-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.success(`Exported ${clients.length} client${clients.length === 1 ? "" : "s"}.`);
  };

  const handleDownloadTemplate = () => {
    downloadTextFile("triton-clients-template.csv", buildCsvTemplate());
    toast.success("CSV template downloaded.");
  };

  const handleImportFile = (file: File) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed = parseImportedRows(results.data);
        const rows = applyImportSafeguards(parsed.rows, clients);
        setPreviewRows(rows);
        setPreviewHeaders(parsed.mapping.sourceHeaders);
        setMappingSummary(
          Object.fromEntries(
            Object.entries(parsed.mapping.mappedFields).map(([field, header]) => [field, header ?? ""]),
          ),
        );
        setPreviewOpen(true);
      },
      error: (error) => {
        toast.error(error.message || "Unable to parse this CSV file.");
      },
    });
  };

  const handleImportValidRows = () => {
    if (validRows.length === 0) {
      toast.error("There are no valid rows to import.");
      return;
    }

    setIsImporting(true);

    try {
      let createdClients = 0;
      let createdPolicies = 0;

      validRows.forEach((row) => {
        const { createdAt, ...clientInput } = row.mappedClient;
        const createdClient = createClient(clientInput);
        createdClients += 1;

        if (createdAt) {
          updateClient(createdClient.id, { createdAt });
        }

        row.products.forEach((product: ParsedImportProduct) => {
          createPolicy({
            clientId: createdClient.id,
            carrier: product.carrier,
            category: product.category,
            productType: product.productType,
            productName: product.productName,
            policyNumber: product.policyNumber,
            sumAssured: product.sumAssured,
            premium: product.premium,
            paymentFrequency: product.paymentFrequency,
            effectiveDate: product.effectiveDate,
            status: product.status,
            loanAmount: product.loanAmount,
            loanRate: product.loanRate,
            isInvestmentLoan: product.isInvestmentLoan,
            lender: product.lender,
            isCorporateInsurance: product.isCorporateInsurance,
            businessName: product.businessName,
            beneficiaries: [],
          });
          createdPolicies += 1;
        });
      });

      const skipped = previewRows.length - validRows.length;
      setPreviewOpen(false);
      setPreviewRows([]);
      toast.success(
        `Imported ${createdClients} client${createdClients === 1 ? "" : "s"} and ${createdPolicies} polic${createdPolicies === 1 ? "y" : "ies"}${skipped ? `, skipped ${skipped} invalid row${skipped === 1 ? "" : "s"}` : ""}.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">Clients</h1>
          <p className="text-sm text-slate-500">{clients.length} total clients</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleImportFile(file);
            }}
          />

          <Button variant="outline" className="rounded-xl" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" />
            Import CSV
          </Button>

          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="text-sm font-medium text-slate-500 transition hover:text-slate-900"
          >
            Download CSV Template
          </button>

          <Button variant="outline" className="rounded-xl" onClick={handleExportCsv}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>

          <Button
            className="rounded-xl bg-slate-900 text-white hover:bg-slate-800"
            onClick={() => toast.info("The add-client flow stays available in the existing modal wiring.")}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Client
          </Button>
        </div>
      </div>

      <ClientsDataTable />

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[85vh] max-w-6xl overflow-hidden rounded-2xl border-slate-200 p-0">
          <DialogHeader className="border-b border-slate-100 px-6 py-5">
            <DialogTitle className="text-lg font-semibold text-slate-900">Review CSV Import</DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              We auto-mapped your headers, validated each row, and will only import valid records.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 px-6 py-5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full px-2.5 py-1 font-medium ${badgeTone(validRows.length > 0)}`}>
                {validRows.length} valid
              </span>
              <span className={`rounded-full px-2.5 py-1 font-medium ${badgeTone(previewRows.length === validRows.length)}`}>
                {previewRows.length - validRows.length} invalid
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600 ring-1 ring-slate-200">
                {previewRows.length} total rows
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-800">
                <FileSpreadsheet className="h-4 w-4 text-slate-500" />
                Auto-mapped fields
              </div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {Object.entries(mappingSummary).map(([field, header]) => (
                  <div key={field} className="rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-slate-200">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{field}</div>
                    <div className="mt-1 truncate font-medium text-slate-700">{header || "Not mapped"}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="max-h-[420px] overflow-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="border-b border-slate-200">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Row
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Email
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Address
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Products
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Validation
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {previewRows.map((row) => (
                      <tr key={row.rowNumber} className={row.valid ? "bg-white" : "bg-rose-50/35"}>
                        <td className="px-4 py-3 align-top text-slate-500">{row.rowNumber}</td>
                        <td className="px-4 py-3 align-top">
                          <div className="font-medium text-slate-900">
                            {[row.mappedClient.firstName, row.mappedClient.lastName].filter(Boolean).join(" ")}
                          </div>
                          <div className="text-xs text-slate-500">{row.mappedClient.phone || "No phone"}</div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="font-medium text-slate-800">{row.mappedClient.email || "Missing email"}</div>
                        </td>
                        <td className="px-4 py-3 align-top text-slate-600">
                          <div>{row.mappedClient.streetAddress || "No street"}</div>
                          <div className="text-xs text-slate-500">
                            {[row.mappedClient.city, row.mappedClient.province, row.mappedClient.postalCode]
                              .filter(Boolean)
                              .join(", ")}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-slate-600">
                          {row.products.length > 0 ? (
                            <div className="space-y-1">
                              {row.products.map((product) => (
                                <div key={product.policyNumber} className="text-xs text-slate-600">
                                  {product.carrier} | {product.productType} | {product.premium}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">No products</span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top">
                          {row.errors.length === 0 ? (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
                              Ready
                            </span>
                          ) : (
                            <ul className="space-y-1 text-xs text-rose-700">
                              {row.errors.map((error, index) => (
                                <li key={`${row.rowNumber}-${error.field}-${index}`}>• {error.message}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {previewHeaders.length > 0 ? (
              <div className="text-xs text-slate-400">
                Source headers: {previewHeaders.join(" · ")}
              </div>
            ) : null}
          </div>

          <DialogFooter className="border-t border-slate-100 px-6 py-4">
            <Button variant="outline" className="rounded-xl" onClick={() => setPreviewOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-xl bg-slate-900 text-white hover:bg-slate-800"
              onClick={handleImportValidRows}
              disabled={isImporting || validRows.length === 0}
            >
              {isImporting ? "Importing..." : `Import Valid Rows (${validRows.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
