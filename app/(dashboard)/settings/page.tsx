// app/(dashboard)/settings/page.tsx
//
// Vertical-sidebar layout per the spec. The previous version used the shared
// <Tabs> primitive, which had broken `data-horizontal:` Tailwind selectors
// (the underlying attribute is `data-orientation="horizontal"`); that bug is
// now fixed in components/ui/tabs.tsx, but the Settings page intentionally
// uses a hand-rolled rail anyway because:
//   - the spec calls for `items-start` so the rail doesn't stretch with the
//     content's height,
//   - the rail's icon-aligned, full-width buttons read better than a tabs
//     bar for top-level navigation,
//   - the right column gets a max width so inputs don't sprawl on big
//     screens.

"use client";

import { useState } from "react";
import { Archive, FileText, Mail, UserCircle, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProfileSection } from "@/components/settings/ProfileSection";
import { EmailConfigSection } from "@/components/settings/EmailConfigSection";
import { TemplatesSection } from "@/components/settings/TemplatesSection";
import { BackupsSection } from "@/components/settings/BackupsSection";
import { cn } from "@/lib/utils";

type SectionId = "profile" | "email" | "templates" | "backups";

interface SectionDef {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  /** Subtle one-liner under the label, hidden on smaller rails. */
  hint: string;
}

const SECTIONS: SectionDef[] = [
  {
    id: "profile",
    label: "Profile",
    icon: UserCircle,
    hint: "Display name & sign-in email",
  },
  {
    id: "email",
    label: "Email",
    icon: Mail,
    hint: "SMTP transport",
  },
  {
    id: "templates",
    label: "Templates",
    icon: FileText,
    hint: "Birthday · Renewal · Festival",
  },
  {
    id: "backups",
    label: "Backups",
    icon: Archive,
    hint: "Snapshots & restore",
  },
];

export default function SettingsPage() {
  const [active, setActive] = useState<SectionId>("profile");

  return (
    <>
      <PageHeader
        title="Settings"
        description="Profile, email transport, templates, and backups"
      />

      {/* Two-column layout. `items-start` is the load-bearing class — without
          it the left rail stretches vertically to match whichever right-side
          card is tallest, which is what produced the "huge empty rectangle
          on the left" bug. `flex-col md:flex-row` collapses the rail to a
          horizontal scroll-strip on phones. */}
      <div className="flex flex-col md:flex-row md:items-start gap-6 md:gap-8">
        {/* === Left rail: section navigation === */}
        <nav
          aria-label="Settings sections"
          className="md:w-56 shrink-0"
        >
          <ul className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const isActive = s.id === active;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setActive(s.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-left whitespace-nowrap md:whitespace-normal",
                      isActive
                        ? "bg-navy/5 text-navy ring-1 ring-navy/10"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        isActive
                          ? "text-navy"
                          : "text-slate-400 group-hover:text-slate-600"
                      )}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block leading-tight">{s.label}</span>
                      {/* Hint stays in the rail on md+ for context; phones
                          drop it to keep the chip compact. */}
                      <span className="hidden md:block text-[11px] font-normal text-slate-400 mt-0.5 truncate">
                        {s.hint}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* === Right column: section content ===
            `min-w-0` is required inside a flex row — without it long
            content (like a wide table or a long email-template subject)
            forces the column wider than the viewport and breaks the
            alignment. `max-w-3xl` keeps inputs from stretching across a
            27" monitor. `space-y-6` matches the existing card rhythm
            elsewhere in the app. */}
        <section className="flex-1 min-w-0 max-w-3xl space-y-6">
          {active === "profile" ? <ProfileSection /> : null}
          {active === "email" ? <EmailConfigSection /> : null}
          {active === "templates" ? <TemplatesSection /> : null}
          {active === "backups" ? <BackupsSection /> : null}
        </section>
      </div>
    </>
  );
}
