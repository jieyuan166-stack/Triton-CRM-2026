// components/clients/ClientsToolbar.tsx
//
// Note on the dropdown implementation:
// We deliberately use a custom popover here instead of the shadcn
// `DropdownMenu` (base-ui Menu). base-ui's Menu auto-closes on item click,
// which is the wrong UX for a multi-select filter and was crashing because
// the CheckboxItem unmounted while still pushing state updates. The custom
// popover keeps the panel open across clicks until the user clicks outside
// or hits Escape.
"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, ChevronDown, MapPin, Search, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DynamicTagBadge } from "@/components/ui-shared/DynamicTagBadge";
import { TAG_LABELS, type TagValue } from "@/lib/constants";
import { provinceLabel } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ClientsToolbarProps {
  search: string;
  onSearch: (v: string) => void;

  selectedProvinces: string[];
  provinceOptions: string[];
  onToggleProvince: (code: string) => void;
  onClearProvinces: () => void;

  selectedTags: string[];
  tagOptions: string[];
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;

  onClearAll: () => void;
}

export function ClientsToolbar(props: ClientsToolbarProps) {
  const {
    search,
    onSearch,
    selectedProvinces,
    provinceOptions,
    onToggleProvince,
    onClearProvinces,
    selectedTags,
    tagOptions,
    onToggleTag,
    onClearTags,
    onClearAll,
  } = props;

  const anyFilter =
    !!search.trim() || selectedProvinces.length > 0 || selectedTags.length > 0;

  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
      {/* Search */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search by name, email or province..."
          className="pl-9 h-9 bg-white"
        />
        {search ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onSearch("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Province filter */}
        <FilterPopover
          icon={MapPin}
          label="Province"
          summary={
            selectedProvinces.length === 0
              ? "All provinces"
              : selectedProvinces.length === 1
              ? provinceLabel(selectedProvinces[0])
              : `${selectedProvinces.length} provinces`
          }
          active={selectedProvinces.length > 0}
          panelLabel="Filter by province"
          options={provinceOptions}
          isSelected={(code) => selectedProvinces.includes(code)}
          onToggle={onToggleProvince}
          onClear={selectedProvinces.length > 0 ? onClearProvinces : undefined}
          renderOption={(code) => (
            <>
              <span className="font-mono text-[11px] text-slate-400 mr-2 w-5 inline-block">
                {code}
              </span>
              {provinceLabel(code)}
            </>
          )}
          emptyHint="No data"
        />

        {/* Tags filter — richer trigger w/ pills + dropdown w/ Check + bg-slate-50 */}
        <TagsFilter
          options={tagOptions}
          selected={selectedTags}
          onToggle={onToggleTag}
          onClear={onClearTags}
        />

        {anyFilter ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-slate-500 hover:text-slate-900"
            onClick={onClearAll}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// === Custom multi-select popover ===

interface FilterPopoverProps {
  icon: React.ElementType;
  label: string;
  summary: string;
  active: boolean;
  panelLabel: string;
  options: string[];
  isSelected: (option: string) => boolean;
  onToggle: (option: string) => void;
  onClear?: () => void;
  renderOption: (option: string) => ReactNode;
  emptyHint: string;
}

function FilterPopover({
  icon: Icon,
  label,
  summary,
  active,
  panelLabel,
  options,
  isSelected,
  onToggle,
  onClear,
  renderOption,
  emptyHint,
}: FilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Click-outside + Esc to close
  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-2 h-9 px-3 rounded-lg border text-sm transition-colors outline-none",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30",
          active
            ? "bg-accent-blue/10 border-accent-blue/30 text-accent-blue"
            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        <span className="font-medium">{label}</span>
        <span className="text-slate-400">·</span>
        <span className={cn(active ? "text-accent-blue" : "text-slate-500")}>
          {summary}
        </span>
        {active ? (
          <Check className="h-3 w-3 text-accent-blue" />
        ) : (
          <ChevronDown
            className={cn(
              "h-3 w-3 text-slate-400 transition-transform",
              open && "rotate-180"
            )}
          />
        )}
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label={panelLabel}
          className="absolute left-0 top-full mt-1.5 w-56 max-h-72 overflow-y-auto bg-white rounded-xl border border-slate-200 shadow-2xl ring-1 ring-black/5 z-50 py-1.5"
        >
          <div className="px-3 pb-1.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              {panelLabel}
            </p>
          </div>

          {options.length === 0 ? (
            <p className="text-xs text-slate-500 px-3 py-2">{emptyHint}</p>
          ) : (
            <ul>
              {options.map((option) => {
                const checked = isSelected(option);
                return (
                  <li key={option}>
                    <button
                      type="button"
                      onClick={() => onToggle(option)}
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left hover:bg-slate-50 transition-colors"
                    >
                      <span
                        className={cn(
                          "h-4 w-4 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors",
                          checked
                            ? "bg-accent-blue border-accent-blue"
                            : "border-slate-300 bg-white"
                        )}
                      >
                        {checked ? (
                          <Check className="h-3 w-3 text-white" strokeWidth={3} />
                        ) : null}
                      </span>
                      <span className="flex-1 text-slate-700">
                        {renderOption(option)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {onClear ? (
            <>
              <div className="my-1 border-t border-slate-100" />
              <button
                type="button"
                onClick={() => {
                  onClear();
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-accent-red hover:bg-slate-50"
              >
                Clear selection
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// === Tags filter (richer trigger + bg-slate-50 + Check icon) ===

function TagsFilter({
  options,
  selected,
  onToggle,
  onClear,
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = selected.length > 0;
  // Inline-pill trigger when 1–2 are selected (compact); fall back to a count
  // badge once it gets crowded so the trigger doesn't keep growing.
  const showInlinePills = active && selected.length <= 2;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-2 h-9 px-3 rounded-lg border text-sm transition-colors outline-none",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30",
          active
            ? "bg-accent-blue/5 border-accent-blue/30"
            : "bg-white border-slate-200 hover:bg-slate-50"
        )}
      >
        <Tag
          className={cn(
            "h-3.5 w-3.5",
            active ? "text-accent-blue" : "text-slate-500"
          )}
        />
        <span
          className={cn(
            "font-medium",
            active ? "text-accent-blue" : "text-slate-700"
          )}
        >
          Tags
        </span>

        {active ? (
          <>
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-accent-blue text-white text-[10px] font-bold tabular-nums">
              {selected.length}
            </span>
            {showInlinePills ? (
              <span className="flex items-center gap-1">
                {(selected as TagValue[]).map((t) => (
                  <DynamicTagBadge key={t} tag={t} />
                ))}
              </span>
            ) : null}
          </>
        ) : (
          <span className="text-slate-500">All</span>
        )}

        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform",
            active ? "text-accent-blue" : "text-slate-400",
            open && "rotate-180"
          )}
        />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Filter by tag"
          aria-multiselectable="true"
          className="absolute left-0 top-full mt-1.5 w-64 bg-white rounded-xl border border-slate-200 shadow-2xl ring-1 ring-black/5 z-50 py-1.5"
        >
          <div className="flex items-center justify-between px-3 pb-1.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              Filter by tag
            </p>
            <span className="text-[10px] tabular-nums text-slate-400">
              {selected.length}/{options.length}
            </span>
          </div>

          {options.length === 0 ? (
            <p className="text-xs text-slate-500 px-3 py-2">No tags yet</p>
          ) : (
            <ul>
              {options.map((option) => {
                const checked = selected.includes(option);
                const tag = option as TagValue;
                return (
                  <li key={option}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={checked}
                      onClick={() => onToggle(option)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors",
                        checked
                          ? "bg-slate-50 hover:bg-slate-100"
                          : "hover:bg-slate-50"
                      )}
                    >
                      <DynamicTagBadge tag={tag} />
                      <span className="flex-1 text-sm text-slate-700">
                        {TAG_LABELS[tag] ?? option}
                      </span>
                      {checked ? (
                        <Check
                          className="h-4 w-4 text-accent-blue shrink-0"
                          strokeWidth={2.5}
                        />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {selected.length > 0 ? (
            <>
              <div className="my-1 border-t border-slate-100" />
              <button
                type="button"
                onClick={() => {
                  onClear();
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-accent-red hover:bg-slate-50"
              >
                Clear selection
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
