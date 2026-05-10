// components/auth/ForgotPasswordDialog.tsx
//
// Mock-mode forgot-password flow:
//   1. User enters their email.
//   2. We compare against the *currently configured* sign-in email
//      (`useAuth().loginEmail`). To avoid leaking which addresses exist we
//      always show the same success copy, regardless of match.
//   3. On match: generate a strong temporary password, write it via
//      `updateCredentials({ password })`, and send it through SMTP using
//      `getEmailService("smtp")`. The user can then sign in and immediately
//      change the password from Settings → Account Security.
//   4. On mismatch: silently no-op (no email goes out — we don't want to
//      relay the temp password to a wrong address).
//
// Security stance: this is a mock. Real prod would issue a one-time signed
// reset link and never email a plaintext password. Keep that in mind.

"use client";

import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ForgotPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill the email field with whatever the user typed on the login form. */
  defaultEmail?: string;
}

/** Generate a 10-char temp password from the unambiguous Crockford-ish
 *  alphabet (no 0/O/1/I/l). Uses Web Crypto for unbiased randomness. */
export function ForgotPasswordDialog({
  open,
  onOpenChange,
  defaultEmail = "",
}: ForgotPasswordDialogProps) {
  const [email, setEmail] = useState(defaultEmail);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail(defaultEmail);
      setDone(false);
    }
  }, [open, defaultEmail]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const target = email.trim().toLowerCase();
    if (!target) return;

    setSubmitting(true);

    let result: Response;
    try {
      result = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target }),
      });
    } catch {
      toast.error("Could not send the reset email", {
        description: "Please check the server connection and try again.",
      });
      setSubmitting(false);
      return;
    }

    if (!result.ok) {
      const payload = await result.json().catch(() => null);
      toast.error("Could not send the reset email", {
        description: payload?.error,
      });
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setDone(true);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset your password</DialogTitle>
          <DialogDescription>
            We&apos;ll email a temporary password to the address registered for
            this account. Use it to sign in, then change it from Settings.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-3 py-2">
            <div className="rounded-md bg-accent-green/10 border border-accent-green/30 px-3 py-3 text-sm text-emerald-700">
              If <span className="font-medium">{email}</span> is registered for
              this CRM, a temporary password has been sent. Check your inbox
              (and spam folder).
            </div>
            <DialogFooter>
              <Button
                onClick={() => onOpenChange(false)}
                className="bg-navy hover:bg-navy/90 text-white"
              >
                Got it
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="forgot-email">Email</Label>
              <Input
                id="forgot-email"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting || !email.trim()}
                className="bg-navy hover:bg-navy/90 text-white min-w-[140px]"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5 mr-1.5" />
                    Send Temporary Password
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
