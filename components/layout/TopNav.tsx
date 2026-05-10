// components/layout/TopNav.tsx
"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FileText, Menu, Plus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { NewClientDialog } from "@/components/clients/NewClientDialog";

interface TopNavProps {
  onMenuClick?: () => void;
}

export function TopNav({ onMenuClick }: TopNavProps) {
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setQuickAddOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setQuickAddOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function handleAddClient() {
    setQuickAddOpen(false);
    setAddClientOpen(true);
  }

  function handleAddPolicy() {
    setQuickAddOpen(false);
    const clientMatch = pathname.match(/^\/clients\/([^/]+)$/);
    const clientId = clientMatch?.[1];
    router.push(clientId ? `/policies/new?clientId=${encodeURIComponent(clientId)}` : "/policies/new");
  }

  return (
    <>
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

        <div ref={menuRef} className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="text-white/70 hover:text-white hover:bg-white/10"
            aria-label="Quick add"
            aria-expanded={quickAddOpen}
            title="Quick add"
            onClick={() => setQuickAddOpen((open) => !open)}
          >
            <Plus className="h-5 w-5" />
          </Button>

          {quickAddOpen ? (
            <div className="absolute right-0 top-11 z-[60] w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 text-slate-700 shadow-xl shadow-slate-950/10">
              <button
                type="button"
                onClick={handleAddClient}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-slate-50"
              >
                <UserPlus className="h-4 w-4 text-slate-400" />
                Add Client
              </button>
              <button
                type="button"
                onClick={handleAddPolicy}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-slate-50"
              >
                <FileText className="h-4 w-4 text-slate-400" />
                Add Policy
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
    <NewClientDialog open={addClientOpen} onOpenChange={setAddClientOpen} />
    </>
  );
}
