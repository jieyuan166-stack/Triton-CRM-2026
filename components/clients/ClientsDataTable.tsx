// components/clients/ClientsDataTable.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Crown,
  Pencil,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/DataProvider";
import { useSettings } from "@/components/providers/SettingsProvider";
import { ClientAvatar } from "@/components/ui-shared/ClientAvatar";
import { ConfirmDialog } from "@/components/ui-shared/ConfirmDialog";
import { DynamicTagBadge } from "@/components/ui-shared/DynamicTagBadge";
import { EmptyState } from "@/components/ui-shared/EmptyState";
import { Pagination } from "@/components/ui-shared/Pagination";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  EmailPreviewDialog,
  type EmailPreviewPayload,
} from "@/components/dashboard/EmailPreviewDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClientsToolbar } from "@/components/clients/ClientsToolbar";
import { NewClientDialog } from "@/components/clients/NewClientDialog";
import type { Client } from "@/lib/types";
import type { EmailTemplateId } from "@/lib/settings-types";
import { applyTemplate } from "@/lib/templates";
import {
  queryClients,
  type ClientSortKey,
  type RowsPerPage,
  type SortDir,
} from "@/lib/clients-query";
import { formatRelative } from "@/lib/date-utils";
import { PROVINCE_CODES } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface SortState {
  key: ClientSortKey;
  dir: SortDir;
}

const COLUMNS: {
  key: ClientSortKey | "tags";
  label: string;
  sortable: boolean;
  className?: string;
}[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "email", label: "Email", sortable: true },
  { key: "province", label: "Province", sortable: true },
  { key: "tags", label: "Tags", sortable: false },
  { key: "lastContact", label: "Last Contact", sortable: true },
];

const PROVINCE_BADGE_CLASS: Record<string, string> = {
  BC: "bg-emerald-100 text-emerald-700",
  ON: "bg-blue-100 text-blue-700",
  AB: "bg-amber-100 text-amber-700",
};

function provinceBadgeClass(province: string) {
  return PROVINCE_BADGE_CLASS[province] ?? "bg-slate-100 text-slate-700";
}

export function ClientsDataTable() {
  const { clients, policies, followUps, deleteClient } = useData();
  const { settings } = useSettings();

  const [search, setSearch] = useState("");
  const [provinces, setProvinces] = useState<string[]>([]);
  const [tagsFilter, setTagsFilter] = useState<string[]>([]);
  const [sort, setSort] = useState<SortState>({ key: "name", dir: "asc" });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<RowsPerPage>(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedTemplateId, setSelectedTemplateId] =
    useState<EmailTemplateId>("festival");
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailPayload, setEmailPayload] = useState<EmailPreviewPayload | null>(
    null
  );
  const [editing, setEditing] = useState<Client | null>(null);

  // Delete confirmation state. We track these as separate flags so the bulk
  // and single-row flows can't collide (e.g. user opens single, then clicks
  // bulk before the first dialog closes).
  const [deletingOne, setDeletingOne] = useState<Client | null>(null);
  const [deletingBulk, setDeletingBulk] = useState(false);

  function handleConfirmDeleteOne() {
    if (!deletingOne) return;
    const name = `${deletingOne.firstName} ${deletingOne.lastName}`;
    const ok = deleteClient(deletingOne.id);
    setDeletingOne(null);
    // Drop from selection in case it was checked too — keeps the bulk bar
    // count honest.
    setSelected((prev) => {
      if (!prev.has(deletingOne.id)) return prev;
      const next = new Set(prev);
      next.delete(deletingOne.id);
      return next;
    });
    if (ok) toast.success("Client deleted", { description: name });
    else toast.error("Could not delete client");
  }

  function handleConfirmDeleteBulk() {
    const ids = Array.from(selected);
    let removed = 0;
    for (const id of ids) {
      if (deleteClient(id)) removed += 1;
    }
    setDeletingBulk(false);
    setSelected(new Set());
    if (removed > 0) {
      toast.success(
        `${removed} client${removed === 1 ? "" : "s"} deleted`,
        { description: "Associated policies and follow-ups were removed too." }
      );
    } else {
      toast.error("Nothing was deleted");
    }
  }

  const result = useMemo(
    () =>
      queryClients(
        {
          search,
          provinces,
          tags: tagsFilter,
          sortKey: sort.key,
          sortDir: sort.dir,
          page,
          perPage,
        },
        { clients, policies, followUps }
      ),
    [search, provinces, tagsFilter, sort, page, perPage, clients, policies, followUps]
  );

  const selectedClients = useMemo(
    () => clients.filter((client) => selected.has(client.id)),
    [clients, selected]
  );
  const selectedClientsWithEmail = selectedClients.filter((client) =>
    client.email?.trim()
  );
  const selectedTemplate =
    settings.templates.find((template) => template.id === selectedTemplateId) ??
    settings.templates[0];

  // Reset to page 1 whenever filter/sort changes
  function setSearchAndReset(v: string) {
    setSearch(v);
    setPage(1);
  }
  function toggleProvince(code: string) {
    setProvinces((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
    setPage(1);
  }
  function toggleTag(tag: string) {
    setTagsFilter((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
    setPage(1);
  }
  function clearAll() {
    setSearch("");
    setProvinces([]);
    setTagsFilter([]);
    setPage(1);
  }

  function clickSort(key: ClientSortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
    setPage(1);
  }

  // Selection state across pagination
  const allOnPageIds = result.rows.map((r) => r.id);
  const allOnPageChecked =
    allOnPageIds.length > 0 && allOnPageIds.every((id) => selected.has(id));
  const someOnPageChecked =
    selected.size > 0 && !allOnPageChecked && allOnPageIds.some((id) => selected.has(id));

  function toggleAllOnPage(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) allOnPageIds.forEach((id) => next.add(id));
      else allOnPageIds.forEach((id) => next.delete(id));
      return next;
    });
  }
  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function openSelectedEmail() {
    if (!selectedTemplate) {
      toast.error("No email template is available.");
      return;
    }

    if (selectedClientsWithEmail.length === 0) {
      toast.error("No selected clients have an email address.");
      return;
    }

    const singleClient =
      selectedClientsWithEmail.length === 1 ? selectedClientsWithEmail[0] : null;
    const clientName = singleClient
      ? `${singleClient.firstName} ${singleClient.lastName}`.trim()
      : "there";
    const vars = {
      "Client Name": clientName,
      Date: new Date().toLocaleDateString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
      Carrier: "",
      "Policy Name": "",
      "Face Amount": "",
      "Premium Amount": "",
    };

    setEmailPayload({
      contextLabel: singleClient
        ? clientName
        : `${selectedClientsWithEmail.length} clients`,
      to: singleClient
        ? singleClient.email
        : settings.email.fromEmail || settings.profile.email,
      bcc: singleClient
        ? undefined
        : selectedClientsWithEmail.map((client) => client.email).join(", "),
      subject: applyTemplate(selectedTemplate.subject, vars),
      body: applyTemplate(selectedTemplate.body, vars),
      attachments: selectedTemplate.attachments ?? [],
      clientId: singleClient?.id,
      template: selectedTemplate.id === "birthday" ? "birthday" : "custom",
    });
    setEmailDialogOpen(true);
  }

  const empty = result.total === 0;
  const hasFilters =
    !!search.trim() || provinces.length > 0 || tagsFilter.length > 0;

  return (
    <>
      <ClientsToolbar
        search={search}
        onSearch={setSearchAndReset}
        selectedProvinces={provinces}
        // Restrict to BC / AB / ON; intersect with codes that actually exist
        // in the data so we don't show selectable options that yield 0 results.
        provinceOptions={PROVINCE_CODES.filter((code) =>
          result.facets.provinces.includes(code)
        )}
        onToggleProvince={toggleProvince}
        onClearProvinces={() => {
          setProvinces([]);
          setPage(1);
        }}
        selectedTags={tagsFilter}
        tagOptions={result.facets.tags}
        onToggleTag={toggleTag}
        onClearTags={() => {
          setTagsFilter([]);
          setPage(1);
        }}
        onClearAll={clearAll}
      />

      {/* Bulk action bar (visible when selection > 0) */}
      {selected.size > 0 ? (
        <div className="mb-3 flex flex-col gap-2 rounded-lg border border-accent-blue/20 bg-accent-blue/5 px-4 py-2.5 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-accent-blue">
              {selected.size} selected
            </span>
            <span className="text-xs text-slate-500">
              {selectedClientsWithEmail.length} with email
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Select
              value={selectedTemplateId}
              onValueChange={(value) =>
                setSelectedTemplateId(value as EmailTemplateId)
              }
            >
              <SelectTrigger className="h-8 w-[150px] border-accent-blue/20 bg-white text-xs">
                <SelectValue placeholder="Template" />
              </SelectTrigger>
              <SelectContent>
                {settings.templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8 bg-navy text-white hover:bg-navy/90"
              onClick={openSelectedEmail}
              disabled={selectedClientsWithEmail.length === 0}
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Send Email
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-accent-red hover:bg-accent-red/10 hover:text-accent-red"
              onClick={() => setDeletingBulk(true)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-accent-blue hover:bg-accent-blue/10"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {empty ? (
          <EmptyState
            icon={Users}
            title={hasFilters ? "No matches" : "No clients yet"}
            description={
              hasFilters
                ? "Try adjusting filters or the search term."
                : "Add your first client to get started."
            }
            action={
              hasFilters ? (
                <Button variant="outline" size="sm" onClick={clearAll}>
                  Clear filters
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-50/60 border-b border-slate-100">
                    <th className="w-10 py-2.5 pl-5 pr-2 md:pl-6">
                      <Checkbox
                        aria-label="Select all on page"
                        checked={allOnPageChecked}
                        indeterminate={someOnPageChecked}
                        onCheckedChange={(c) => toggleAllOnPage(c === true)}
                      />
                    </th>
                    {/* Data columns */}
                    {COLUMNS.map((col) => {
                      const isSortable = col.sortable;
                      const isActive =
                        isSortable && sort.key === (col.key as ClientSortKey);
                      const Indicator = isActive
                        ? sort.dir === "asc"
                          ? ArrowUp
                          : ArrowDown
                        : ChevronsUpDown;
                      return (
                        <th
                          key={col.key}
                          className={cn("py-2.5 pr-3", col.className)}
                        >
                          {isSortable ? (
                            <button
                              type="button"
                              className={cn(
                                "inline-flex items-center gap-1 font-semibold transition-colors",
                                isActive
                                  ? "text-slate-700"
                                  : "text-slate-400 hover:text-slate-700"
                              )}
                              onClick={() =>
                                clickSort(col.key as ClientSortKey)
                              }
                            >
                              {col.label}
                              <Indicator
                                className={cn(
                                  "h-3 w-3",
                                  isActive
                                    ? "text-slate-700"
                                    : "text-slate-300"
                                )}
                              />
                            </button>
                          ) : (
                            col.label
                          )}
                        </th>
                      );
                    })}
                    {/* Actions column */}
                    <th className="w-16 py-2.5 pr-5 text-right md:pr-6">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.rows.map((r) => {
                    const isChecked = selected.has(r.id);
                    const isVipClient = r.tags.includes("VIP");
                    return (
                      <tr
                        key={r.id}
                        className={cn(
                          "transition-colors group",
                          isChecked
                            ? "bg-accent-blue/5"
                            : "hover:bg-slate-50"
                        )}
                      >
                        <td className="py-2.5 pl-5 pr-2 align-middle md:pl-6">
                          <Checkbox
                            aria-label={`Select ${r.firstName} ${r.lastName}`}
                            checked={isChecked}
                            onCheckedChange={(c) => toggleOne(r.id, c === true)}
                          />
                        </td>
                        <td className="py-2.5 pr-3">
                          <Link
                            href={`/clients/${r.id}`}
                            className="flex items-center gap-3 min-w-0"
                          >
                            <ClientAvatar
                              firstName={r.firstName}
                              lastName={r.lastName}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <p
                                className={cn(
                                  "flex items-center gap-1.5 truncate font-semibold",
                                  isVipClient
                                    ? "text-amber-900"
                                    : "text-slate-900"
                                )}
                              >
                                <span className="truncate">
                                  {r.firstName} {r.lastName}
                                </span>
                                {isVipClient ? (
                                  <Crown
                                    className="h-3.5 w-3.5 shrink-0 text-amber-500"
                                    aria-label="VIP client"
                                  />
                                ) : null}
                              </p>
                              {r.email ? (
                                <p className="text-xs text-slate-500 truncate md:hidden">
                                  {r.email}
                                </p>
                              ) : null}
                            </div>
                          </Link>
                        </td>
                        <td className="py-2.5 pr-3">
                          <p className="max-w-[16rem] truncate text-[13px] font-medium text-sky-700">
                            {r.email ?? "—"}
                          </p>
                          {r.phone ? (
                            <p className="text-[11px] text-slate-400">
                              {r.phone}
                            </p>
                          ) : null}
                        </td>
                        <td className="py-2.5 pr-3">
                          {r.province ? (
                            <span
                              className={cn(
                                "inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium leading-none",
                                provinceBadgeClass(r.province)
                              )}
                            >
                              {r.province}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3">
                          {r.tags.length === 0 ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1 max-w-[14rem]">
                              {r.tags.map((t) => (
                                <DynamicTagBadge key={t} tag={t} />
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 pr-3">
                          {r.lastContactAt ? (
                            <span className="text-sm text-slate-700 tabular-nums">
                              {formatRelative(r.lastContactAt)}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-sm">
                              Never
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-5 text-right md:pr-6">
                          <div className="inline-flex items-center justify-end gap-0.5">
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              className="h-8 w-8 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                              aria-label={`Edit ${r.firstName} ${r.lastName}`}
                              onClick={(e) => {
                                // Stop the row's row-level interactions; the
                                // edit button should not double-fire navigation.
                                e.preventDefault();
                                e.stopPropagation();
                                const full = clients.find((c) => c.id === r.id);
                                if (full) setEditing(full);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              className="h-8 w-8 text-slate-400 hover:text-accent-red hover:bg-accent-red/10"
                              aria-label={`Delete ${r.firstName} ${r.lastName}`}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const full = clients.find((c) => c.id === r.id);
                                if (full) setDeletingOne(full);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              page={result.page}
              perPage={result.perPage}
              total={result.total}
              totalPages={result.totalPages}
              onPageChange={setPage}
              onPerPageChange={(n) => {
                setPerPage(n as RowsPerPage);
                setPage(1);
              }}
            />
          </>
        )}
      </div>

      {/* Edit Client modal — same component as New Client, populated via the
          `client` prop. Tags will be recomputed automatically on save. */}
      <NewClientDialog
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        client={editing ?? undefined}
      />


      <EmailPreviewDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        payload={emailPayload}
        onSent={() => setSelected(new Set())}
      />

      {/* Single-row delete confirmation. We pass the full client object via
          state so the description can show the name being deleted. */}
      <ConfirmDialog
        open={!!deletingOne}
        onOpenChange={(o) => {
          if (!o) setDeletingOne(null);
        }}
        title="Are you absolutely sure?"
        description={
          <>
            This action cannot be undone. This will permanently delete{" "}
            <span className="font-semibold">
              {deletingOne
                ? `${deletingOne.firstName} ${deletingOne.lastName}`
                : "this client"}
            </span>{" "}
            and all of their associated policies and follow-ups.
          </>
        }
        confirmLabel="Delete"
        onConfirm={handleConfirmDeleteOne}
      />

      {/* Bulk delete confirmation. */}
      <ConfirmDialog
        open={deletingBulk}
        onOpenChange={setDeletingBulk}
        title="Are you absolutely sure?"
        description={
          <>
            This action cannot be undone. This will permanently delete the{" "}
            <span className="font-semibold">{selected.size} selected</span>{" "}
            client{selected.size === 1 ? "" : "s"} and all of their associated
            policies and follow-ups.
          </>
        }
        confirmLabel={`Delete ${selected.size} client${selected.size === 1 ? "" : "s"}`}
        onConfirm={handleConfirmDeleteBulk}
      />
    </>
  );
}
