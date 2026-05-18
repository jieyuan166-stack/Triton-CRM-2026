// components/layout/TopNav.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Menu, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { useAuth } from "@/components/providers/AuthProvider";

interface TopNavProps {
  onMenuClick?: () => void;
}

export function TopNav({ onMenuClick }: TopNavProps) {
  const { session, signOut } = useAuth();
  const router = useRouter();
  const userLabel = session?.user?.name || session?.user?.email || "Signed in";
  const userEmail = session?.user?.email ?? "";

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center gap-4 border-b border-[#C99A3A]/20 bg-navy px-4 shadow-[0_18px_45px_-32px_rgba(7,27,51,0.95)] md:px-6">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#C99A3A]/70 to-transparent" />
      {/* Mobile menu toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="text-white/80 hover:bg-white/10 hover:text-white lg:hidden"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Brand */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Link
          href="/dashboard"
          aria-label="Go to dashboard"
          className="shrink-0 rounded-sm focus:outline-none focus:ring-2 focus:ring-[#D7B56D]/70"
        >
          <Image
            src="/brand/triton-logo-horizontal.png"
            alt="Triton Wealth Management"
            width={1162}
            height={262}
            priority
            className="h-9 w-auto object-contain drop-shadow-[0_1px_1px_rgba(0,0,0,0.18)]"
          />
        </Link>
        <span className="hidden border-l border-[#C99A3A]/25 pl-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#D7B56D]/75 sm:inline-block">
          CRM
        </span>
      </div>

      {/* Right cluster: search */}
      <div className="flex items-center gap-2 md:gap-3">
        <GlobalSearch />
        <div className="hidden min-w-0 items-center gap-2 rounded-full border border-[#C99A3A]/20 bg-white/[0.07] px-3 py-1.5 text-white/90 shadow-inner md:flex">
          <UserCircle className="h-4 w-4 shrink-0 text-[#D7B56D]/75" />
          <div className="min-w-0 leading-tight">
            <p className="max-w-36 truncate text-xs font-semibold">{userLabel}</p>
            {userEmail && userEmail !== userLabel ? (
              <p className="max-w-36 truncate text-[10px] text-white/45">{userEmail}</p>
            ) : null}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-white/70 hover:bg-white/10 hover:text-white"
          onClick={handleSignOut}
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
