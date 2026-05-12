// app/(dashboard)/layout.tsx — shared layout for all dashboard routes
"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { TopNav } from "@/components/layout/TopNav";
import { Sidebar } from "@/components/layout/Sidebar";
import { useAuth } from "@/components/providers/AuthProvider";
import { DataProvider } from "@/components/providers/DataProvider";
import { SettingsProvider } from "@/components/providers/SettingsProvider";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { session, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Auth gate — redirect anonymous users to /login. We wait for `ready` so
  // the NextAuth session hydrates before deciding.
  useEffect(() => {
    if (ready && !session) {
      const next = encodeURIComponent(pathname);
      router.replace(`/login?next=${next}`);
    }
  }, [ready, session, router, pathname]);

  if (!ready || !session) {
    // Prevent flash of authed UI while we hydrate / redirect.
    return null;
  }

  return (
    <DataProvider>
    <SettingsProvider>
    <div className="flex h-full flex-col">
      {/* Fixed top nav */}
      <TopNav onMenuClick={() => setMobileOpen(true)} />

      {/* Below nav: sidebar + main */}
      <div className="flex flex-1 pt-16">
        {/* Desktop sidebar */}
        <Sidebar className="hidden md:flex fixed top-16 bottom-0 left-0 z-40" />

        {/* Mobile sidebar via Sheet */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="p-0 w-60">
            <div className="flex flex-col h-full pt-4">
              <Sidebar className="flex" onNavigate={() => setMobileOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>

        {/* Main content area */}
        <main className="flex-1 md:ml-60 min-h-0 overflow-auto bg-surface">
          <div className="p-6 md:p-8">{children}</div>
      </main>
      </div>
      <Toaster position="top-right" richColors closeButton />
    </div>
    </SettingsProvider>
    </DataProvider>
  );
}
