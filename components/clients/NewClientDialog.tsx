// components/clients/NewClientDialog.tsx
//
// New Client v2 — fields, validation, and interactions per the brief:
//   - React Hook Form + Zod (lib/validators.ts:clientFormSchema)
//   - Phone mask "(XXX) XXX-XXXX" via lib/phone-format.ts
//   - Street Address: location icon + Google Places stub
//   - Postal Code: Canadian regex (lib/constants.ts)
//   - Tags: pill-style multi-select using TAG_VALUES
//   - Linked To: searchable existing-client picker; conditional Relationship
//   - Submit: loading state, POST to /api/clients, toast, refresh list
"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Check,
  Loader2,
  Plus,
  Search,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useData } from "@/components/providers/DataProvider";
import { ClientAvatar } from "@/components/ui-shared/ClientAvatar";
import { ClientNameDisplay } from "@/components/ui-shared/ClientNameDisplay";
import { AddressAutocomplete } from "@/components/clients/AddressAutocomplete";
import {
  PROVINCE_CODES,
  RELATIONSHIP_TYPES,
  formatPostalCode,
  isProvinceCode,
  isRelationshipType,
} from "@/lib/constants";
import { inverseRelationship } from "@/lib/family";
import { provinceLabel, type Client, type ClientRelationship } from "@/lib/types";
import { formatPhone } from "@/lib/phone-format";
import {
  clientFormSchema,
  type ClientFormValues,
} from "@/lib/validators";

interface NewClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass an existing Client to switch the dialog into Edit mode. The form
   *  hydrates from this record, the title becomes "Edit Client", and submit
   *  routes to updateClient() instead of createClient(). */
  client?: Client;
  /** Called after a successful create OR update. */
  onCreated?: (client: { id: string }) => void;
}

// Tags are 100% computed from client + policy state — see lib/client-tags.ts.
// This form never persists or surfaces them.
const DEFAULTS: Partial<ClientFormValues> = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  streetAddress: "",
  unit: "",
  city: "",
  province: undefined,
  postalCode: "",
  birthday: undefined,
  notes: "",
};

interface RelationshipDraft {
  id: string;
  toClientId?: string;
  relationship?: ClientRelationship["relationship"];
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-accent-red mt-1">{message}</p>;
}

export function NewClientDialog({
  open,
  onOpenChange,
  client,
  onCreated,
}: NewClientDialogProps) {
  const {
    clients,
    createClient,
    updateClient,
    getClientRelationships,
    replaceClientRelationships,
  } = useData();
  const router = useRouter();
  const isEdit = !!client;
  const [relationshipDrafts, setRelationshipDrafts] = useState<RelationshipDraft[]>([]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: DEFAULTS as ClientFormValues,
    mode: "onBlur",
  });

  useEffect(() => {
    if (!open) return;
    if (client) {
      // Edit mode — hydrate from the persisted record.
      reset({
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email,
        phone: client.phone ?? "",
        streetAddress: client.streetAddress ?? "",
        unit: client.unit ?? "",
        city: client.city ?? "",
        province: client.province,
        postalCode: client.postalCode ?? "",
        birthday: client.birthday,
        notes: client.notes ?? "",
      } as ClientFormValues);
      const relationships = getClientRelationships(client.id);
      const drafts = relationships.map((relationship) => {
        const outgoing = relationship.fromClientId === client.id;
        const visibleRelationship = outgoing
          ? relationship.relationship
          : inverseRelationship(relationship.relationship);
        return {
          id: relationship.id,
          toClientId: outgoing
            ? relationship.toClientId
            : relationship.fromClientId,
          relationship: isRelationshipType(visibleRelationship)
            ? visibleRelationship
            : undefined,
        } satisfies RelationshipDraft;
      });
      if (drafts.length === 0 && client.linkedToId && client.relationship) {
        drafts.push({
          id: `legacy_${client.id}_${client.linkedToId}`,
          toClientId: client.linkedToId,
          relationship: client.relationship,
        });
      }
      setRelationshipDrafts(drafts);
    } else {
      reset(DEFAULTS as ClientFormValues);
      setRelationshipDrafts([]);
    }
  }, [open, client, getClientRelationships, reset]);

  const phone = watch("phone") ?? "";
  const postalCode = watch("postalCode") ?? "";

  function handlePhoneChange(e: ChangeEvent<HTMLInputElement>) {
    setValue("phone", formatPhone(e.target.value), { shouldValidate: false });
  }
  function handlePostalChange(e: ChangeEvent<HTMLInputElement>) {
    setValue("postalCode", formatPostalCode(e.target.value), {
      shouldValidate: false,
    });
  }

  function validateRelationshipDrafts() {
    const active = relationshipDrafts.filter(
      (draft) => draft.toClientId || draft.relationship
    );
    const incomplete = active.some(
      (draft) => !draft.toClientId || !draft.relationship
    );
    if (incomplete) {
      toast.error("Linked client is incomplete", {
        description: "Choose both a client and a relationship, or remove the row.",
      });
      return null;
    }
    const seen = new Set<string>();
    const duplicates = active.some((draft) => {
      if (!draft.toClientId) return false;
      if (seen.has(draft.toClientId)) return true;
      seen.add(draft.toClientId);
      return false;
    });
    if (duplicates) {
      toast.error("Duplicate linked client", {
        description: "Each family member can only be linked once.",
      });
      return null;
    }
    return active.map((draft) => ({
      toClientId: draft.toClientId!,
      relationship: draft.relationship!,
    }));
  }

  async function onSubmit(values: ClientFormValues) {
    const nextRelationships = validateRelationshipDrafts();
    if (!nextRelationships) return;

    // Common patch payload (sans id / createdAt — those stay).
    const patch = {
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      phone: values.phone,
      streetAddress: values.streetAddress,
      unit: values.unit,
      city: values.city,
      province: values.province as Client["province"],
      postalCode: values.postalCode,
      birthday: values.birthday,
      notes: values.notes,
    };

    if (isEdit && client) {
      const updated = updateClient(client.id, patch);
      if (!updated) {
        toast.error("Could not update client");
        return;
      }
      replaceClientRelationships(updated.id, nextRelationships);
      toast.success("Client updated", {
        description: `${updated.firstName} ${updated.lastName} saved`,
      });
      onCreated?.({ id: updated.id });
      onOpenChange(false);
      return;
    }

    const emailLower = values.email.toLowerCase();
    const emailExists = clients.some(
      (existing) => existing.email.toLowerCase() === emailLower
    );

    if (emailExists) {
      toast.error("Could not create client", {
        description: "Email already exists in Triton CRM.",
      });
      return;
    }

    const created = createClient(patch);
    replaceClientRelationships(created.id, nextRelationships);
    toast.success("Client created", {
      description: `${created.firstName} ${created.lastName} added to your book`,
      action: {
        label: "Open profile",
        onClick: () => router.push(`/clients/${created.id}`),
      },
    });
    onCreated?.({ id: created.id });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-slate-400" />
            {isEdit ? "Edit Client" : "New Client"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the client's profile. Tags are recalculated automatically."
              : "Required: First Name, Last Name, Email. Everything else can be filled in later."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* === Identity === */}
          <Section title="Identity">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="cli-firstName">
                  First Name <span className="text-accent-red">*</span>
                </Label>
                <Input
                  id="cli-firstName"
                  autoFocus
                  autoComplete="given-name"
                  {...register("firstName")}
                />
                <FieldError message={errors.firstName?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cli-lastName">
                  Last Name <span className="text-accent-red">*</span>
                </Label>
                <Input
                  id="cli-lastName"
                  autoComplete="family-name"
                  {...register("lastName")}
                />
                <FieldError message={errors.lastName?.message} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="space-y-1.5">
                <Label htmlFor="cli-email">
                  Email <span className="text-accent-red">*</span>
                </Label>
                <Input
                  id="cli-email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  {...register("email")}
                />
                <FieldError message={errors.email?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cli-phone">Phone</Label>
                <Input
                  id="cli-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(XXX) XXX-XXXX"
                  value={phone}
                  onChange={handlePhoneChange}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="space-y-1.5">
                <Label htmlFor="cli-birthday">Birthday</Label>
                <Input
                  id="cli-birthday"
                  type="date"
                  {...register("birthday")}
                />
              </div>
            </div>
          </Section>

          {/* === Address === */}
          <Section title="Address">
            <div className="space-y-1.5">
              <Label htmlFor="cli-street">Street Address</Label>
              <AddressAutocomplete
                id="cli-street"
                value={watch("streetAddress") ?? ""}
                onChange={(v) =>
                  setValue("streetAddress", v, { shouldValidate: false })
                }
                onAddressSelect={(parsed) => {
                  // Auto-fill street + city + postal code + province from
                  // Google Places. Postal code is normalised to "V6B 1A1"
                  // form. Province is only accepted if it's in our
                  // serviceable list (BC / AB / ON).
                  setValue("streetAddress", parsed.streetAddress);
                  if (parsed.city) setValue("city", parsed.city);
                  if (parsed.postalCode) {
                    setValue("postalCode", formatPostalCode(parsed.postalCode));
                  }
                  if (parsed.province) {
                    if (isProvinceCode(parsed.province)) {
                      setValue("province", parsed.province, {
                        shouldValidate: true,
                      });
                    } else {
                      // Out-of-region — surface a toast so the advisor knows
                      // why the field stayed empty.
                      toast.warning("Address is outside BC / AB / ON", {
                        description: `Province "${parsed.province}" isn't in your serviceable list.`,
                      });
                    }
                  }
                }}
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Selecting a suggestion auto-fills city, province, and postal code.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div className="space-y-1.5">
                <Label htmlFor="cli-unit">Unit / Suite</Label>
                <Input
                  id="cli-unit"
                  placeholder="Apt 1402"
                  {...register("unit")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cli-city">City</Label>
                <Input
                  id="cli-city"
                  autoComplete="address-level2"
                  placeholder="Toronto"
                  {...register("city")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cli-province">Province</Label>
                <Select
                  value={watch("province") ?? ""}
                  onValueChange={(v) =>
                    setValue("province", (v ?? "") as never, {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger id="cli-province" className="w-full">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVINCE_CODES.map((code) => (
                      <SelectItem key={code} value={code}>
                        <span className="font-mono text-[11px] text-slate-400 mr-2">
                          {code}
                        </span>
                        {provinceLabel(code)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="space-y-1.5">
                <Label htmlFor="cli-postal">Postal Code</Label>
                <Input
                  id="cli-postal"
                  autoComplete="postal-code"
                  placeholder="V6B 1A1"
                  value={postalCode}
                  onChange={handlePostalChange}
                />
                <FieldError message={errors.postalCode?.message} />
              </div>
            </div>
          </Section>

          {/* === Linked clients === */}
          <Section title="Linked Clients (Family / Relationship)" optional>
            <div className="space-y-3">
              {relationshipDrafts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-5 text-center">
                  <p className="text-sm font-medium text-slate-700">
                    No linked clients yet
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Add family members or business relationships here.
                  </p>
                </div>
              ) : (
                relationshipDrafts.map((draft, index) => {
                  const selectedIds = new Set(
                    relationshipDrafts
                      .filter((item) => item.id !== draft.id)
                      .map((item) => item.toClientId)
                      .filter(Boolean)
                  );
                  const availableClients = clients.filter(
                    (candidate) =>
                      candidate.id !== client?.id && !selectedIds.has(candidate.id)
                  );
                  return (
                    <div
                      key={draft.id}
                      className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-[minmax(0,1fr)_180px_auto]"
                    >
                      <LinkedClientPicker
                        clients={availableClients}
                        selectedId={draft.toClientId}
                        onSelect={(id) => {
                          setRelationshipDrafts((prev) =>
                            prev.map((item) =>
                              item.id === draft.id
                                ? { ...item, toClientId: id }
                                : item
                            )
                          );
                        }}
                      />
                      <Select
                        value={draft.relationship ?? ""}
                        onValueChange={(v) =>
                          setRelationshipDrafts((prev) =>
                            prev.map((item) =>
                              item.id === draft.id
                                ? {
                                    ...item,
                                    relationship: v as ClientRelationship["relationship"],
                                  }
                                : item
                            )
                          )
                        }
                      >
                        <SelectTrigger
                          id={`cli-relationship-${index}`}
                          className="w-full"
                        >
                          <SelectValue placeholder="Relationship" />
                        </SelectTrigger>
                        <SelectContent>
                          {RELATIONSHIP_TYPES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="justify-self-start text-slate-400 hover:text-red-600 md:justify-self-end"
                        onClick={() =>
                          setRelationshipDrafts((prev) =>
                            prev.filter((item) => item.id !== draft.id)
                          )
                        }
                        aria-label="Remove linked client"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg"
                onClick={() =>
                  setRelationshipDrafts((prev) => [
                    ...prev,
                    { id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` },
                  ])
                }
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add Linked Client
              </Button>
            </div>
          </Section>

          {/* === Notes === */}
          <Section title="Notes" optional>
            <Textarea
              rows={3}
              placeholder="Anything worth remembering…"
              className="resize-none"
              {...register("notes")}
            />
          </Section>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-navy hover:bg-navy/90 text-white min-w-[140px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                  {isEdit ? "Save Changes" : "Save Client"}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// === Sub-components ===

function Section({
  title,
  optional,
  children,
}: {
  title: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t first:border-t-0 first:pt-0 border-slate-100 pt-5">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </h3>
        {optional ? (
          <span className="text-[10px] text-slate-400">Optional</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

interface LinkedClientPickerProps {
  clients: { id: string; firstName: string; lastName: string; email: string }[];
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
}

function LinkedClientPicker({
  clients,
  selectedId,
  onSelect,
}: LinkedClientPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected = clients.find((c) => c.id === selectedId);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients.slice(0, 8);
    return clients
      .filter((c) =>
        `${c.firstName} ${c.lastName} ${c.email}`.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [clients, query]);

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

  return (
    <div ref={wrapperRef} className="relative">
      {selected ? (
        <div className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg">
          <ClientAvatar
            firstName={selected.firstName}
            lastName={selected.lastName}
            size="xs"
          />
          <div className="flex-1 min-w-0">
            <ClientNameDisplay
              firstName={selected.firstName}
              lastName={selected.lastName}
              size="sm"
            />
            <p className="text-xs text-slate-500 truncate">{selected.email}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              onSelect(undefined);
              setQuery("");
            }}
            aria-label="Unlink client"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-500 hover:bg-slate-50 transition-colors"
        >
          <Search className="h-3.5 w-3.5" />
          Search existing clients to link…
        </button>
      )}

      {open && !selected ? (
        <div className="absolute left-0 right-0 mt-1.5 bg-white rounded-xl border border-slate-200 shadow-2xl ring-1 ring-black/5 z-50 max-h-72 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-slate-100">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to search by name or email"
              className="h-8"
            />
          </div>
          <div className="overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">
                No matches
              </p>
            ) : (
              <ul>
                {filtered.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(c.id);
                        setOpen(false);
                        setQuery("");
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 transition-colors"
                    >
                      <ClientAvatar
                        firstName={c.firstName}
                        lastName={c.lastName}
                        size="xs"
                      />
                      <div className="flex-1 min-w-0">
                        <ClientNameDisplay
                          firstName={c.firstName}
                          lastName={c.lastName}
                          size="sm"
                        />
                        <p className="text-xs text-slate-500 truncate">
                          {c.email}
                        </p>
                      </div>
                      {c.id === selectedId ? (
                        <Check className="h-3.5 w-3.5 text-accent-blue" />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
