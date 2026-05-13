// components/layout/GlobalSearch.tsx
// Command-palette-style global search for the TopBar.
"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, FileText, Search, Users, X } from "lucide-react";
import { useData } from "@/components/providers/DataProvider";
import { ClientAvatar } from "@/components/ui-shared/ClientAvatar";
import { ClientNameDisplay } from "@/components/ui-shared/ClientNameDisplay";
import { Input } from "@/components/ui/input";
import { CARRIER_COLORS } from "@/lib/carrier-colors";
import { calculateClientTags } from "@/lib/client-tags";
import {
  flattenHits,
  searchAll,
  type SearchHit,
  type SearchResults,
} from "@/lib/search";
import { cn } from "@/lib/utils";

export function GlobalSearch() {
  const router = useRouter();
  const { clients, policies } = useData();

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results: SearchResults = useMemo(
    () => searchAll(query, clients, policies),
    [query, clients, policies]
  );

  const flat = useMemo(() => flattenHits(results), [results]);
  const hasQuery = query.trim().length > 0;

  // Reset focus index when results change
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Click-outside / escape to close
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
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Cmd/Ctrl-K to focus
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function navigateTo(hit: SearchHit) {
    router.push(hit.href);
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (flat.length === 0 ? 0 : (i + 1) % flat.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) =>
        flat.length === 0 ? 0 : (i - 1 + flat.length) % flat.length
      );
    } else if (e.key === "Enter") {
      if (flat[activeIndex]) {
        e.preventDefault();
        navigateTo(flat[activeIndex]);
      }
    }
  }

  // Scroll active item into view
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-search-index="${activeIndex}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  return (
    <div ref={wrapperRef} className="relative hidden md:block">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/50 pointer-events-none z-10" />

      <Input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search clients or policies..."
        aria-label="Search clients or policies"
        autoComplete="off"
        spellCheck={false}
        className="w-64 h-9 pl-9 pr-16 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:bg-white/15 focus-visible:border-white/40 focus-visible:ring-white/20"
      />

      {/* Right-side adornments inside the input */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {hasQuery ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="h-5 w-5 rounded flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        ) : (
          <kbd className="hidden lg:inline-flex items-center text-[10px] font-number text-white/40 bg-white/5 border border-white/10 rounded px-1.5 py-0.5">
            ⌘K
          </kbd>
        )}
      </div>

      {/* Results dropdown */}
      {open && hasQuery ? (
        <div
          ref={listRef}
          role="listbox"
          aria-label="Search results"
          className="absolute right-0 mt-2 w-96 max-h-[28rem] overflow-y-auto bg-white rounded-xl border border-slate-200 shadow-2xl ring-1 ring-black/5 z-50 text-slate-900"
        >
          {results.total === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-slate-700 font-medium">
                No results found
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Nothing matches{" "}
                <span className="font-number text-slate-700">
                  &quot;{query.trim()}&quot;
                </span>
              </p>
            </div>
          ) : (
            <>
              {results.clients.length > 0 ? (
                <SearchGroup
                  label="Clients"
                  icon={Users}
                  count={results.clients.length}
                >
                  {results.clients.map((hit, idx) => (
                    <SearchItem
                      key={hit.id}
                      index={idx}
                      activeIndex={activeIndex}
                      onActivate={() => navigateTo(hit)}
                      onHover={() => setActiveIndex(idx)}
                      leading={
                        <ClientAvatar
                          firstName={hit.client.firstName}
                          lastName={hit.client.lastName}
                          size="xs"
                        />
                      }
                      primary={
                        <ClientNameDisplay
                          firstName={hit.client.firstName}
                          lastName={hit.client.lastName}
                          isVip={calculateClientTags(hit.client, policies).includes("VIP")}
                          size="sm"
                        />
                      }
                      secondary={hit.secondary}
                    />
                  ))}
                </SearchGroup>
              ) : null}

              {results.policies.length > 0 ? (
                <SearchGroup
                  label="Policies"
                  icon={FileText}
                  count={results.policies.length}
                  bordered={results.clients.length > 0}
                >
                  {results.policies.map((hit, idx) => {
                    const realIndex = results.clients.length + idx;
                    return (
                      <SearchItem
                        key={hit.id}
                        index={realIndex}
                        activeIndex={activeIndex}
                        onActivate={() => navigateTo(hit)}
                        onHover={() => setActiveIndex(realIndex)}
                        leading={
                          <span
                            className="block w-1 h-7 rounded-full shrink-0"
                            style={{
                              backgroundColor: CARRIER_COLORS[hit.policy.carrier],
                            }}
                          />
                        }
                        primary={hit.primary}
                        secondary={hit.secondary}
                      />
                    );
                  })}
                </SearchGroup>
              ) : null}

              {/* Footer */}
              <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 bg-slate-50/60 text-[10px] text-slate-500">
                <span className="font-number">
                  {results.total} {results.total === 1 ? "result" : "results"}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-flex items-center gap-1">
                    <kbd className="font-number bg-white border border-slate-200 rounded px-1 py-0.5">
                      ↑↓
                    </kbd>
                    navigate
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <kbd className="font-number bg-white border border-slate-200 rounded px-1 py-0.5">
                      <CornerDownLeft className="h-2.5 w-2.5" />
                    </kbd>
                    open
                  </span>
                </span>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

// === Internal subcomponents ===

function SearchGroup({
  label,
  icon: Icon,
  count,
  bordered,
  children,
}: {
  label: string;
  icon: React.ElementType;
  count: number;
  bordered?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(bordered && "border-t border-slate-100")}>
      <div className="flex items-center gap-1.5 px-3 pt-3 pb-1.5">
        <Icon className="h-3 w-3 text-slate-400" />
        <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
          {label}
        </span>
        <span className="text-[10px] font-number text-slate-300">
          {count}
        </span>
      </div>
      <div className="pb-1.5">{children}</div>
    </div>
  );
}

function SearchItem({
  index,
  activeIndex,
  onActivate,
  onHover,
  leading,
  primary,
  secondary,
}: {
  index: number;
  activeIndex: number;
  onActivate: () => void;
  onHover: () => void;
  leading: React.ReactNode;
  primary: React.ReactNode;
  secondary: string;
}) {
  const isActive = index === activeIndex;
  return (
    <button
      type="button"
      role="option"
      aria-selected={isActive}
      data-search-index={index}
      onMouseDown={(e) => {
        // Prevent input losing focus before click fires
        e.preventDefault();
      }}
      onMouseEnter={onHover}
      onClick={onActivate}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
        isActive ? "bg-slate-100" : "hover:bg-slate-50"
      )}
    >
      <span className="shrink-0">{leading}</span>
      <span className="flex-1 min-w-0">
        <div className="min-w-0 truncate">{primary}</div>
        <p className="text-xs text-slate-500 truncate">{secondary}</p>
      </span>
    </button>
  );
}
