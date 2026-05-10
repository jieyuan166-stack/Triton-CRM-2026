// components/layout/TopNav.tsx
"use client";

import Image from "next/image";
import { Menu, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "@/components/layout/GlobalSearch";

interface TopNavProps {
  onMenuClick?: () => void;
}

export function TopNav({ onMenuClick }: TopNavProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-navy flex items-center px-4 md:px-6 gap-4">
      {/* Mobile menu toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden text-white/80 hover:text-white hover:bg-white/10"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Brand */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Image
          src="/brand/triton-logo-horizontal.png"
          alt="Triton Wealth Management"
          width={1162}
          height={262}
          priority
          className="h-9 w-auto object-contain"
        />
        <span className="hidden sm:inline-block text-white/30 text-[10px] font-medium uppercase tracking-[0.2em] border-l border-white/15 pl-3">
          CRM
        </span>
      </div>

      {/* Right cluster: search · quick add */}
      <div className="flex items-center gap-2 md:gap-3">
        <GlobalSearch />

        <Button
          variant="ghost"
          size="icon"
          className="text-white/70 hover:text-white hover:bg-white/10"
          aria-label="Quick add"
          title="Quick add"
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
