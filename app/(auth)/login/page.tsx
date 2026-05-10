// app/(auth)/login/page.tsx — mock-credential sign-in.
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Suspense } from "react";
import { Loader2, LogIn } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { ForgotPasswordDialog } from "@/components/auth/ForgotPasswordDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const authError = params.get("error");
  const authCode = params.get("code");

  const { session, ready, signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  // If already signed in, bounce away immediately.
  useEffect(() => {
    if (ready && session) router.replace(next);
  }, [ready, session, router, next]);

  useEffect(() => {
    if (authError || authCode) {
      setError("Invalid email or password");
    }
  }, [authError, authCode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const r = await signIn(email, password);
      if (!r.ok) {
        setError(r.error ?? "Invalid email or password");
        return;
      }
      router.replace(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign-in failed";
      setError(message || "Sign-in failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl ring-1 ring-black/5 px-6 py-8 md:px-8 md:py-10">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <Image
            src="/brand/triton-logo-vertical.png"
            alt="Triton Wealth Management"
            width={994}
            height={1062}
            priority
            className="h-20 w-auto object-contain mb-3"
          />
          <p className="text-[10px] uppercase tracking-[0.25em] font-medium text-slate-400">
            CRM · Sign In
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="login-password">Password</Label>
              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="text-[11px] text-accent-blue hover:underline focus:outline-none focus:underline"
              >
                Forgot password?
              </button>
            </div>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error ? (
            <div className="rounded-md bg-accent-red/10 text-accent-red text-xs px-3 py-2 border border-accent-red/20">
              {error}
            </div>
          ) : null}

          <Button
            type="submit"
            disabled={submitting}
            className="w-full h-10 bg-navy hover:bg-navy/90 text-white"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <LogIn className="h-4 w-4 mr-2" />
            )}
            Sign In
          </Button>
        </form>

      </div>

      <p className="text-center text-[11px] text-slate-400 mt-6">
        © {new Date().getFullYear()} Triton Wealth Management Corporation
      </p>

      <ForgotPasswordDialog
        open={forgotOpen}
        onOpenChange={setForgotOpen}
        defaultEmail={email}
      />
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
