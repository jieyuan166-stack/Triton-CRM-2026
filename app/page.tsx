// app/page.tsx — entry redirect.
// Authentication state lives in localStorage (mock), so the routing decision
// happens on the client. Server-side just renders an instant client redirect
// shell.
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";

export default function RootPage() {
  const router = useRouter();
  const { session, ready } = useAuth();

  useEffect(() => {
    if (!ready) return;
    router.replace(session ? "/dashboard" : "/login");
  }, [session, ready, router]);

  return null;
}
