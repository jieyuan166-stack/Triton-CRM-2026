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
        "flex flex-col w-60 bg-white border-r border-slate-200 pt-5 pb-6",
        className
      )}
    >
      {/* Section label */}
      <p className="px-6 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
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
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group",
                active
                  ? "bg-navy text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  active ? "text-white" : "text-slate-400 group-hover:text-slate-600"
                )}
              />
              <span className="flex-1">{label}</span>
              {typeof badge === "number" && badge > 0 ? (
                <span
                  className={cn(
                    "text-[11px] font-semibold font-number px-2 py-0.5 rounded-md transition-colors",
                    active
                      ? "bg-white/15 text-white"
                      : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
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
      <div className="mx-6 mt-4 pt-4 border-t border-slate-100">
        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">
          Triton CRM v1.0
        </p>
      </div>
    </aside>
  );
}
