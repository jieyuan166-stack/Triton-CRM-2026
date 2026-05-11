// app/page.tsx — entry redirect.
// Auth state comes from NextAuth; the root screen only chooses the right
// landing route after the client session has hydrated.
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
