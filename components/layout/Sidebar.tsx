// components/layout/Sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileText,
  LayoutDashboard,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useData } from "@/components/providers/DataProvider";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Function returning a badge count, or undefined to hide */
  count?: () => number;
}

interface SidebarProps {
  className?: string;
  /** Called when an item is clicked — useful to close mobile drawer */
  onNavigate?: () => void;
}

export function Sidebar({ className, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const { clients, policies } = useData();

  const items: NavItem[] = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    {
      label: "Clients",
      href: "/clients",
      icon: Users,
      count: () => clients.length,
    },
    {
      label: "Policies",
      href: "/policies",
      icon: FileText,
      count: () => policies.length,
    },
    { label: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <aside
      className={cn(
        "flex w-60 flex-col border-r border-[#E8DCC4] bg-[#FFFCF6]/95 pt-5 pb-6 shadow-[8px_0_30px_-28px_rgba(7,27,51,0.55)]",
        className
      )}
    >
      {/* Section label */}
      <p className="mb-2 px-6 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#9A7A3B]">
        Workspace
      </p>

      <nav className="flex-1 px-3 space-y-0.5">
        {items.map(({ label, href, icon: Icon, count }) => {
          const active =
            href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(href);
          const badge = count?.();
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                "group flex items-center gap-3 rounded-lg border-l-2 px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-[#C99A3A] bg-navy text-white shadow-[0_12px_30px_-24px_rgba(7,27,51,0.9)]"
                  : "border-transparent text-slate-600 hover:bg-[#F4EAD8] hover:text-navy"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  active ? "text-[#D7B56D]" : "text-slate-400 group-hover:text-[#9A7A3B]"
                )}
              />
              <span className="flex-1">{label}</span>
              {typeof badge === "number" && badge > 0 ? (
                <span
                  className={cn(
                    "text-[11px] font-semibold font-number px-2 py-0.5 rounded-md transition-colors",
                    active
                      ? "bg-[#C99A3A]/18 text-white"
                      : "bg-[#F1E6D3] text-slate-600 group-hover:bg-[#E9D3A7]"
                  )}
                >
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {/* Bottom version tag */}
      <div className="mx-6 mt-4 border-t border-[#E8DCC4] pt-4">
        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
          Triton CRM v1.0
        </p>
      </div>
    </aside>
  );
}
