// components/ui-shared/ConfirmDialog.tsx
//
// Reusable destructive-action confirmation modal.
//
// Built on the existing shadcn/ui <Dialog> primitive (which itself wraps
// @base-ui/react). We don't have a separate AlertDialog primitive in this
// project — this component fills that role: a focused, opinionated wrapper
// for the "are you sure?" pattern. The visible Cancel + Confirm buttons
// keep keyboard focus inside the popup, exactly like Radix's AlertDialog.
//
// Usage:
//   const [open, setOpen] = useState(false);
//   <ConfirmDialog
//     open={open}
//     onOpenChange={setOpen}
//     title="Are you absolutely sure?"
//     description="This action cannot be undone."
//     confirmLabel="Delete"
//     onConfirm={() => doTheThing()}
//   />

"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Plain string OR pre-rendered ReactNode for richer copy. */
  description?: React.ReactNode;
  /** Defaults to "Cancel". */
  cancelLabel?: string;
  /** Defaults to "Confirm". For deletes pass "Delete". */
  confirmLabel?: string;
  /** "destructive" paints the confirm button red — default for our use. */
  tone?: "destructive" | "primary";
  /** Sync or async — async lets us show a spinner while the action resolves. */
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  cancelLabel = "Cancel",
  confirmLabel = "Confirm",
  tone = "destructive",
  onConfirm,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    try {
      setBusy(true);
      await onConfirm();
    } finally {
      setBusy(false);
      onOpenChange(false);
    }
  }

  const confirmClass =
    tone === "destructive"
      ? "bg-accent-red hover:bg-accent-red/90 text-white"
      : "bg-navy hover:bg-navy/90 text-white";

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button className={confirmClass} onClick={handleConfirm} disabled={busy}>
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
