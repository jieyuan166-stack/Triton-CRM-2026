"use client";

import { useState } from "react";
import { FileBarChart2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { buildClientReportFilename } from "@/lib/client-report";
import type { Client } from "@/lib/types";
import { cn } from "@/lib/utils";

type ClientReportButtonProps = {
  client: Client;
  className?: string;
  label?: string;
};

export function ClientReportButton({
  client,
  className,
  label = "Portfolio Review",
}: ClientReportButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async () => {
    setIsGenerating(true);

    try {
      // The report API resolves the current client, direct family links, and
      // policies server-side so the downloaded PDF cannot depend on stale UI data.
      const response = await fetch(`/api/clients/${client.id}/report`, {
        method: "GET",
        cache: "no-store",
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
      title="Generate Portfolio Review PDF"
      className={cn(
        "h-9 rounded-xl border-[#E8DCC4] bg-[#F4EAD8]/70 px-3.5 font-semibold text-navy shadow-[0_1px_0_rgba(7,27,51,0.04)] transition duration-200 hover:-translate-y-0.5 hover:border-[#C99A3A]/55 hover:bg-card hover:text-[#8A641E] hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#C99A3A]/30 active:translate-y-0 disabled:opacity-70",
        className
      )}
    >
      <FileBarChart2 className="mr-1.5 h-3.5 w-3.5" />
      {isGenerating ? "Generating..." : label}
    </Button>
  );
}
