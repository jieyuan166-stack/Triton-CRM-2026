"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, RefreshCw, Save, Shield, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WidgetCard } from "@/components/ui-shared/WidgetCard";
import { useAuth } from "@/components/providers/AuthProvider";
import { cn } from "@/lib/utils";

type UserRole = "admin" | "advisor";

type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
  _count: {
    clients: number;
    policies: number;
  };
};

type UserDraft = {
  name: string;
  role: UserRole;
};

function roleBadgeClass(role: UserRole) {
  return role === "admin"
    ? "bg-navy/5 text-navy ring-1 ring-navy/10"
    : "bg-slate-50 text-slate-600 ring-1 ring-slate-200";
}

export function UsersSection() {
  const { session } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    role: "advisor" as UserRole,
    password: "",
  });

  const currentUserId = session?.user?.id ?? "";

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      users?: AdminUser[];
      error?: string;
    } | null;
    setLoading(false);

    if (!response.ok || !payload?.ok || !payload.users) {
      toast.error("Could not load users", {
        description: payload?.error ?? "Please try again.",
      });
      return;
    }

    setUsers(payload.users);
    setDrafts(
      Object.fromEntries(
        payload.users.map((user) => [
          user.id,
          {
            name: user.name,
            role: user.role,
          },
        ]),
      ),
    );
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const createDisabled = useMemo(() => {
    return (
      !createForm.name.trim() ||
      !createForm.email.trim() ||
      createForm.password.length < 12
    );
  }, [createForm]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    if (createDisabled) return;

    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: createForm.name.trim(),
        email: createForm.email.trim(),
        role: createForm.role,
        password: createForm.password,
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      user?: AdminUser;
      error?: string;
    } | null;

    if (!response.ok || !payload?.ok || !payload.user) {
      toast.error("Could not create user", {
        description: payload?.error ?? "Please check the fields and try again.",
      });
      return;
    }

    setCreateForm({ name: "", email: "", role: "advisor", password: "" });
    toast.success("User created");
    await loadUsers();
  }

  async function updateUser(userId: string, patch: Partial<UserDraft> & { password?: string }) {
    setSavingId(userId);
    const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      user?: AdminUser;
      error?: string;
    } | null;
    setSavingId(null);

    if (!response.ok || !payload?.ok || !payload.user) {
      toast.error("Could not update user", {
        description: payload?.error ?? "Please try again.",
      });
      return false;
    }

    toast.success("User updated");
    await loadUsers();
    return true;
  }

  async function deleteUser(user: AdminUser) {
    if (
      !window.confirm(
        `Delete ${user.name} (${user.email}) and all CRM data owned by this user? This cannot be undone.`,
      )
    ) {
      return;
    }

    setSavingId(user.id);
    const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
      method: "DELETE",
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
    } | null;
    setSavingId(null);

    if (!response.ok || !payload?.ok) {
      toast.error("Could not delete user", {
        description: payload?.error ?? "Please try again.",
      });
      return;
    }

    toast.success("User deleted");
    await loadUsers();
  }

  async function submitReset(userId: string) {
    if (resetPassword.length < 12) {
      toast.error("Temporary password must be at least 12 characters");
      return;
    }

    const ok = await updateUser(userId, { password: resetPassword });
    if (ok) {
      setResettingId(null);
      setResetPassword("");
    }
  }

  return (
    <div className="space-y-6">
      <WidgetCard
        title="Users"
        description="Admin-only account management. CRM data remains isolated by user."
        icon={<Shield className="h-4 w-4 text-navy" />}
        action={
          <Button type="button" variant="outline" size="sm" onClick={loadUsers} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading ? "animate-spin" : "")} />
            Refresh
          </Button>
        }
      >
        <div className="space-y-4">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-triton-muted">No users found.</p>
          ) : (
            <div className="space-y-3">
              {users.map((user) => {
                const draft = drafts[user.id] ?? { name: user.name, role: user.role };
                const isCurrent = user.id === currentUserId;
                const isProtectedAdmin = user.email === "admin@tritonwealth.ca" || user.role === "admin";
                const dirty = draft.name.trim() !== user.name || draft.role !== user.role;

                return (
                  <div
                    key={user.id}
                    className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">{user.email}</p>
                          <Badge className={roleBadgeClass(user.role)}>{user.role}</Badge>
                          {isCurrent ? (
                            <Badge className="bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                              You
                            </Badge>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
                          <div className="space-y-1">
                            <Label htmlFor={`user-name-${user.id}`} className="text-[10px] uppercase tracking-wider text-slate-400">
                              Name
                            </Label>
                            <Input
                              id={`user-name-${user.id}`}
                              value={draft.name}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [user.id]: {
                                    ...draft,
                                    name: event.target.value,
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`user-role-${user.id}`} className="text-[10px] uppercase tracking-wider text-slate-400">
                              Role
                            </Label>
                            <select
                              id={`user-role-${user.id}`}
                              value={draft.role}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [user.id]: {
                                    ...draft,
                                    role: event.target.value as UserRole,
                                  },
                                }))
                              }
                              className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-navy/40 focus:ring-2 focus:ring-navy/10"
                            >
                              <option value="advisor">Advisor</option>
                              <option value="admin">Admin</option>
                            </select>
                          </div>
                        </div>
                        <p className="text-xs text-triton-muted">
                          {user._count.clients} clients · {user._count.policies} policies · Created{" "}
                          <span className="font-number">
                            {new Date(user.createdAt).toLocaleDateString()}
                          </span>
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!dirty || savingId === user.id}
                          onClick={() => updateUser(user.id, draft)}
                        >
                          <Save className="h-3.5 w-3.5" />
                          Save
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setResettingId((current) => (current === user.id ? null : user.id));
                            setResetPassword("");
                          }}
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          Reset
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={savingId === user.id || isCurrent || isProtectedAdmin}
                          onClick={() => deleteUser(user)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </div>
                    </div>

                    {resettingId === user.id ? (
                      <div className="mt-4 rounded-lg border-l-2 border-slate-200 bg-slate-50/70 p-4">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                          <div className="space-y-1.5">
                            <Label htmlFor={`reset-password-${user.id}`}>
                              Temporary Password
                            </Label>
                            <Input
                              id={`reset-password-${user.id}`}
                              type="password"
                              value={resetPassword}
                              onChange={(event) => setResetPassword(event.target.value)}
                              placeholder="At least 12 characters"
                            />
                          </div>
                          <Button
                            type="button"
                            className="bg-navy text-white hover:bg-navy/90"
                            disabled={savingId === user.id}
                            onClick={() => submitReset(user.id)}
                          >
                            Save Password
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </WidgetCard>

      <form onSubmit={createUser} className="rounded-xl border border-slate-200 bg-card shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4 md:px-6">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-700">
            Create User
          </h3>
          <p className="mt-0.5 text-xs text-triton-muted">
            New users start with empty CRM data and their own settings.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 px-5 py-5 md:grid-cols-2 md:px-6">
          <div className="space-y-1.5">
            <Label htmlFor="new-user-name">Name</Label>
            <Input
              id="new-user-name"
              value={createForm.name}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, name: event.target.value }))
              }
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-user-email">Email</Label>
            <Input
              id="new-user-email"
              type="email"
              value={createForm.email}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, email: event.target.value }))
              }
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-user-role">Role</Label>
            <select
              id="new-user-role"
              value={createForm.role}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, role: event.target.value as UserRole }))
              }
              className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-navy/40 focus:ring-2 focus:ring-navy/10"
            >
              <option value="advisor">Advisor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-user-password">Initial Password</Label>
            <Input
              id="new-user-password"
              type="password"
              value={createForm.password}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, password: event.target.value }))
              }
              placeholder="At least 12 characters"
              required
            />
          </div>
        </div>
        <div className="flex justify-end rounded-b-xl border-t border-slate-100 bg-slate-50/50 px-5 py-3 md:px-6">
          <Button
            type="submit"
            className="bg-navy text-white hover:bg-navy/90"
            disabled={createDisabled}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Create User
          </Button>
        </div>
      </form>
    </div>
  );
}
