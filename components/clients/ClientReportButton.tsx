"use client";

import { useState } from "react";
import { FileBarChart2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useData } from "@/components/providers/DataProvider";
import { buildClientReportFilename } from "@/lib/client-report";
import { buildFamilySummary } from "@/lib/family";
import type { Client, Policy } from "@/lib/types";
import { cn } from "@/lib/utils";

type ClientReportButtonProps = {
  client: Client;
  policies: Policy[];
  className?: string;
  label?: string;
};

export function ClientReportButton({
  client,
  policies,
  className,
  label = "Portfolio Review",
}: ClientReportButtonProps) {
  const { clients, policies: allPolicies, relationships } = useData();
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async () => {
    setIsGenerating(true);

    try {
      const familySummary = buildFamilySummary(client, clients, allPolicies, relationships);
      const reportPolicies =
        familySummary.linkedClients.length > 0
          ? familySummary.policies
          : policies;
      const response = await fetch(`/api/clients/${client.id}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client,
          policies: reportPolicies,
          family: familySummary.linkedClients.length > 0
            ? {
                linkedClients: familySummary.linkedClients.map((link) => ({
                  client: link.client,
                  relationship: link.relationship,
                })),
                insuranceFaceAmount: familySummary.insuranceFaceAmount,
                investmentAum: familySummary.investmentAum,
              }
            : undefined,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Unable to generate PDF report.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = buildClientReportFilename(client);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("PDF report downloaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to generate PDF report.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={handleDownload}
      disabled={isGenerating}
      aria-label={label}
      className={cn(
        "h-9 rounded-xl border-blue-100 bg-blue-50/70 px-3.5 text-[#002147] shadow-[0_1px_0_rgba(15,23,42,0.03)] transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-white hover:text-[#001832] hover:shadow-sm active:translate-y-0 disabled:opacity-70",
        className
      )}
    >
      <FileBarChart2 className="mr-1.5 h-3.5 w-3.5" />
      {isGenerating ? "Generating..." : label}
    </Button>
  );
}
