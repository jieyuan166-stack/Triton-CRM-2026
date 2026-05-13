"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Client } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ClientComboboxProps {
  clients: Client[];
  value?: string;
  onChange: (clientId: string) => void;
  placeholder?: string;
  emptyText?: string;
  className?: string;
}

function clientLabel(client: Client): string {
  return `${client.firstName} ${client.lastName}`.trim();
}

function clientSearchText(client: Client): string {
  return [
    client.firstName,
    client.lastName,
    client.email,
    client.phone,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function ClientCombobox({
  clients,
  value,
  onChange,
  placeholder = "Search clients...",
  emptyText = "No clients found",
  className,
}: ClientComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedClient = clients.find((client) => client.id === value);
  const filteredClients = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((client) => clientSearchText(client).includes(q));
  }, [clients, query]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "h-9 w-full justify-between bg-white px-3 text-left font-normal",
          !selectedClient && "text-slate-400"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0 truncate">
          {selectedClient ? clientLabel(selectedClient) : placeholder}
        </span>
        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 text-slate-400" />
      </Button>

      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="relative border-b border-slate-100 p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Type a name or email..."
              className="h-8 border-slate-100 bg-slate-50 pl-8 pr-8 text-sm"
              autoFocus
            />
            {query ? (
              <button
                type="button"
                aria-label="Clear client search"
                onClick={() => setQuery("")}
                className="absolute right-4 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>

          <div className="max-h-64 overflow-y-auto p-1" role="listbox">
            {filteredClients.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-slate-500">
                {emptyText}
              </div>
            ) : (
              filteredClients.map((client) => {
                const selected = client.id === value;
                return (
                  <button
                    key={client.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(client.id);
                      setQuery("");
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      selected
                        ? "bg-blue-50 text-[#002147]"
                        : "text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500">
                      {client.firstName?.[0]}
                      {client.lastName?.[0]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {clientLabel(client)}
                      </span>
                      {client.email ? (
                        <span className="block truncate text-xs text-slate-400">
                          {client.email}
                        </span>
                      ) : null}
                    </span>
                    {selected ? (
                      <Check className="h-4 w-4 shrink-0 text-blue-600" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
