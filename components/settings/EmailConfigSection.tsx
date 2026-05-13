// components/settings/EmailConfigSection.tsx
"use client";

import { useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Lock,
  Save,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettings } from "@/components/providers/SettingsProvider";
import { cn } from "@/lib/utils";

export function EmailConfigSection() {
  const { settings, updateEmailConfig } = useSettings();
  const { email } = settings;

  const [host, setHost] = useState(email.host);
  const [port, setPort] = useState<number>(email.port);
  const [secure, setSecure] = useState<boolean>(email.secure);
  const [user, setUser] = useState(email.user);
  const [fromName, setFromName] = useState(email.fromName);
  const [fromEmail, setFromEmail] = useState(email.fromEmail);

  const passwordOk = !!email.passwordConfigured;

  const dirty =
    host !== email.host ||
    port !== email.port ||
    secure !== email.secure ||
    user !== email.user ||
    fromName !== email.fromName ||
    fromEmail !== email.fromEmail;

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateEmailConfig({
      host: host.trim(),
      port: Number(port),
      secure,
      user: user.trim(),
      fromName: fromName.trim(),
      fromEmail: fromEmail.trim(),
    });
    toast.success("Email configuration saved");
  }

  return (
    <form
      onSubmit={handleSave}
      className="bg-card rounded-xl border border-slate-200 shadow-sm"
    >
      <div className="px-5 md:px-6 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          SMTP Server
        </h3>
        <p className="text-xs text-triton-muted mt-0.5">
          Outbound email transport. Used by the email service for reminders and
          campaigns.
        </p>
      </div>

      <div className="px-5 md:px-6 py-5 space-y-5">
        {/* Password status banner */}
        <div
          className={cn(
            "flex items-start gap-3 rounded-lg border px-4 py-3",
            passwordOk
              ? "border-accent-green/30 bg-accent-green/5"
              : "border-accent-amber/40 bg-accent-amber/5"
          )}
        >
          <div
            className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
              passwordOk
                ? "bg-accent-green/15 text-emerald-700"
                : "bg-accent-amber/15 text-amber-700"
            )}
          >
            {passwordOk ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-triton-text">
              SMTP App Password{" "}
              <span
                className={cn(
                  "ml-1 text-xs font-medium",
                  passwordOk ? "text-emerald-700" : "text-amber-700"
                )}
              >
                {passwordOk ? "Configured" : "Not set"}
              </span>
            </p>
            <p className="text-xs text-triton-muted mt-0.5 leading-relaxed">
              The password is read from{" "}
              <code className="px-1 py-0.5 rounded bg-slate-100 text-[11px] font-number">
                SMTP_PASSWORD
              </code>{" "}
              in <code className="px-1 py-0.5 rounded bg-slate-100 text-[11px] font-number">.env.local</code>{" "}
              and never stored in the database. Generate a Google App Password at{" "}
              <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noreferrer"
                className="text-accent-blue hover:underline"
              >
                myaccount.google.com/apppasswords
              </a>
              .
            </p>
          </div>
          <Lock className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-1" />
        </div>

        {/* Host / Port / Secure */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="smtp-host">SMTP Host</Label>
            <Input
              id="smtp-host"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtp-port">Port</Label>
            <Input
              id="smtp-port"
              type="number"
              min={1}
              max={65535}
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtp-secure">Encryption</Label>
            <Select
              value={secure ? "ssl" : "starttls"}
              onValueChange={(v) => setSecure(v === "ssl")}
            >
              <SelectTrigger id="smtp-secure" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ssl">Implicit SSL/TLS (port 465)</SelectItem>
                <SelectItem value="starttls">STARTTLS (port 587)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* User */}
        <div className="space-y-1.5">
          <Label htmlFor="smtp-user">Auth User</Label>
          <Input
            id="smtp-user"
            type="email"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            required
          />
          <p className="text-[11px] text-triton-muted">
            Gmail account used to authenticate.
          </p>
        </div>

        {/* From */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="smtp-from-name">From — Display Name</Label>
            <Input
              id="smtp-from-name"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtp-from-email">From — Address</Label>
            <Input
              id="smtp-from-email"
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
            />
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">
            Preview
          </p>
          <p className="text-triton-text">
            <ShieldCheck className="inline h-3.5 w-3.5 text-emerald-600 mr-1" />
            <span className="font-number">
              {fromName ? `${fromName} ` : ""}&lt;{fromEmail || "—"}&gt;
            </span>{" "}
            via{" "}
            <span className="font-number">
              {host}:{port} ({secure ? "SSL" : "STARTTLS"})
            </span>
          </p>
        </div>
      </div>

      <div className="px-5 md:px-6 py-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/50 rounded-b-xl">
        <Button
          type="submit"
          size="sm"
          disabled={!dirty}
          className="bg-navy hover:bg-navy/90 text-white"
        >
          <Save className="h-3.5 w-3.5 mr-1.5" />
          Save Configuration
        </Button>
      </div>
    </form>
  );
}
