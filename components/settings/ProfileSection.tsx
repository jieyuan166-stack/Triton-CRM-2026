// components/settings/ProfileSection.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Save, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/providers/AuthProvider";
import { useSettings } from "@/components/providers/SettingsProvider";

export function ProfileSection() {
  const { settings, updateProfile } = useSettings();
  const { loginEmail, updateCredentials, signOut } = useAuth();
  const router = useRouter();
  const { profile } = settings;

  // Personal info (display name + admin contact email — distinct from login)
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);

  // Account security: sign-in email + password
  const [signInEmail, setSignInEmail] = useState(loginEmail);
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [secSaving, setSecSaving] = useState(false);

  // Hydrate sign-in email when AuthProvider becomes ready.
  useEffect(() => {
    if (loginEmail) setSignInEmail(loginEmail);
  }, [loginEmail]);

  const profileDirty =
    name !== profile.name || email !== profile.email;

  const securityDirty =
    signInEmail.trim() !== loginEmail ||
    newPwd.length > 0 ||
    confirmPwd.length > 0;

  function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    updateProfile({ name: name.trim(), email: email.trim() });
    toast.success("Profile saved");
  }

  async function handleSecuritySave(e: React.FormEvent) {
    e.preventDefault();

    const trimmedEmail = signInEmail.trim();
    if (!trimmedEmail) {
      toast.error("Sign-in email is required");
      return;
    }

    // Password: only validate when the user is changing it (both fields filled).
    const wantsPasswordChange = newPwd.length > 0 || confirmPwd.length > 0;
    if (wantsPasswordChange) {
      if (newPwd.length < 12) {
        toast.error("New password must be at least 12 characters");
        return;
      }
      if (newPwd !== confirmPwd) {
        toast.error("Passwords don't match");
        return;
      }
    }

    setSecSaving(true);
    const result = await updateCredentials({
      email: trimmedEmail !== loginEmail ? trimmedEmail : undefined,
      password: wantsPasswordChange ? newPwd : undefined,
    });
    setSecSaving(false);

    if (!result.ok) {
      toast.error("Could not update credentials", {
        description: result.error,
      });
      return;
    }

    setNewPwd("");
    setConfirmPwd("");

    if (trimmedEmail !== loginEmail && wantsPasswordChange) {
      toast.success("Sign-in email and password updated", {
        description: "Use the new credentials at your next sign-in.",
      });
    } else if (trimmedEmail !== loginEmail) {
      toast.success("Sign-in email updated", {
        description: `Use ${result.email} at your next sign-in.`,
      });
    } else {
      toast.success("Password updated");
    }
  }

  return (
    <div className="space-y-6">
      {/* Personal Info */}
      <form
        onSubmit={handleProfileSave}
        className="bg-card rounded-xl border border-slate-200 shadow-sm"
      >
        <div className="px-5 md:px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Personal Info
          </h3>
          <p className="text-xs text-triton-muted mt-0.5">
            Display name and admin contact email shown across the app.
          </p>
        </div>
        <div className="px-5 md:px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Display Name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-email">Admin Contact Email</Label>
            <Input
              id="profile-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <p className="text-[11px] text-triton-muted">
              Used for system notifications. Distinct from your sign-in email.
            </p>
          </div>
        </div>
        <div className="px-5 md:px-6 py-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/50 rounded-b-xl">
          <Button
            type="submit"
            size="sm"
            disabled={!profileDirty}
            className="bg-navy hover:bg-navy/90 text-white"
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            Save Changes
          </Button>
        </div>
      </form>

      {/* Account Security */}
      <form
        onSubmit={handleSecuritySave}
        className="bg-card rounded-xl border border-slate-200 shadow-sm"
      >
        <div className="px-5 md:px-6 py-4 border-b border-slate-100">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Account Security
              </h3>
              <p className="text-xs text-triton-muted mt-0.5">
                Sign-in email and password used to access this CRM.
              </p>
            </div>
            <ShieldCheck className="h-4 w-4 text-slate-400" />
          </div>
        </div>

        {/* Sign-in email */}
        <div className="px-5 md:px-6 pt-5 pb-4">
          <div className="space-y-1.5">
            <Label htmlFor="sec-email">Sign-in Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <Input
                id="sec-email"
                type="email"
                autoComplete="email"
                className="pl-9"
                value={signInEmail}
                onChange={(e) => setSignInEmail(e.target.value)}
                required
              />
            </div>
            <p className="text-[11px] text-triton-muted">
              Currently:{" "}
              <span className="font-mono text-slate-700">{loginEmail}</span>
            </p>
          </div>
        </div>

        {/* Password change */}
        <div className="px-5 md:px-6 pb-5 pt-2 border-t border-slate-100">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mt-3 mb-2">
            Change Password
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pwd-new">New Password</Label>
              <Input
                id="pwd-new"
                type="password"
                autoComplete="new-password"
                placeholder="12+ characters, blank to keep current"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pwd-confirm">Confirm New Password</Label>
              <Input
                id="pwd-confirm"
                type="password"
                autoComplete="new-password"
                placeholder="Repeat new password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="px-5 md:px-6 py-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/50 rounded-b-xl">
          <Button
            type="submit"
            size="sm"
            disabled={secSaving || !securityDirty}
            className="bg-navy hover:bg-navy/90 text-white"
          >
            <KeyRound className="h-3.5 w-3.5 mr-1.5" />
            Save Credentials
          </Button>
        </div>
      </form>

      {/* Sign out */}
      <div className="bg-card rounded-xl border border-slate-200 shadow-sm">
        <div className="px-5 md:px-6 py-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Session
            </h3>
            <p className="text-xs text-triton-muted mt-0.5">
              End the current sign-in and return to the login screen.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-accent-red border-accent-red/30 hover:bg-accent-red/10 hover:text-accent-red"
            onClick={() => {
              void signOut();
              router.replace("/login");
            }}
          >
            <LogOut className="h-3.5 w-3.5 mr-1.5" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
