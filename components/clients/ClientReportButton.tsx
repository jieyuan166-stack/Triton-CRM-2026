"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { buildClientReportFilename } from "@/lib/client-report";
import type { Client, Policy } from "@/lib/types";
import { cn } from "@/lib/utils";

type ClientReportButtonProps = {
  client: Client;
  policies: Policy[];
  className?: string;
  iconOnly?: boolean;
};

export function ClientReportButton({
  client,
  policies,
  className,
  iconOnly = false,
}: ClientReportButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async () => {
    setIsGenerating(true);

    try {
      const response = await fetch(`/api/clients/${client.id}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client, policies }),
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
      size={iconOnly ? "icon-lg" : "sm"}
      variant={iconOnly ? "ghost" : "default"}
      onClick={handleDownload}
      disabled={isGenerating}
      aria-label="Generate Portfolio Report"
      className={cn(
        iconOnly
          ? "text-[#002147] hover:bg-slate-100 hover:text-[#001832] disabled:opacity-70"
          : "rounded-lg bg-[#002147] text-white shadow-sm transition hover:bg-[#001832] disabled:opacity-70",
        className
      )}
    >
      <svg
        aria-hidden="true"
        className={cn("h-4 w-4", !iconOnly && "mr-2")}
        viewBox="0 0 384 512"
        fill="currentColor"
      >
        <path d="M64 0C28.7 0 0 28.7 0 64v384c0 35.3 28.7 64 64 64h256c35.3 0 64-28.7 64-64V160H256c-17.7 0-32-14.3-32-32V0H64zm192 0v128h128L256 0zM64 256c0-17.7 14.3-32 32-32h64c35.3 0 64 28.7 64 64s-28.7 64-64 64h-32v32c0 17.7-14.3 32-32 32s-32-14.3-32-32V256zm96 32H128v32h32c17.7 0 32-14.3 32-32s-14.3-32-32-32zm96-64h32c35.3 0 64 28.7 64 64v64c0 35.3-28.7 64-64 64h-32c-17.7 0-32-14.3-32-32V256c0-17.7 14.3-32 32-32zm32 160c17.7 0 32-14.3 32-32v-64c0-17.7-14.3-32-32-32h-32v128h32z" />
      </svg>
      {iconOnly ? (
        <span className="sr-only">
          {isGenerating ? "Generating portfolio report" : "Generate Portfolio Report"}
        </span>
      ) : (
        isGenerating ? "Generating..." : "Report"
      )}
    </Button>
  );
}
