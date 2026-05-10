// components/providers/SettingsProvider.tsx
// In-memory store for app settings. Step 10 swaps the implementation for
// Prisma-backed server actions; the consumer API stays the same.
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  AdminProfile,
  AppSettings,
  BackupRecord,
  BackupSnapshot,
  EmailConfig,
  EmailSignature,
  EmailTemplate,
  EmailTemplateId,
} from "@/lib/settings-types";
import { getBackupService } from "@/lib/backup-service";
import { DEFAULT_SIGNATURE, DEFAULT_TEMPLATES } from "@/lib/templates";

// === Public-safe defaults ===
// These mirror the .env.local defaults the user provided in the spec.
// The SMTP password lives only in env (server-only) — `passwordConfigured`
// is the UI-visible status flag.

const DEFAULT_PROFILE: AdminProfile = {
  id: "user_admin",
  name: "Jeffrey Y",
  email: "jieyuan165@gmail.com",
  passwordUpdatedAt: undefined,
};

const DEFAULT_EMAIL: EmailConfig = {
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  user: "jieyuan165@gmail.com",
  fromName: "Jeffrey Yuan",
  fromEmail: "jieyuan165@gmail.com",
  passwordConfigured: false, // hydrated from server check on mount
};

interface SettingsContextValue {
  settings: AppSettings;
  // mutations
  updateProfile(patch: Partial<AdminProfile>): void;
  changePassword(current: string, next: string): Promise<{ ok: boolean; error?: string }>;
  requestPasswordReset(): Promise<{ ok: boolean }>;
  updateEmailConfig(patch: Partial<EmailConfig>): void;

  // templates + signature
  updateTemplate(id: EmailTemplateId, patch: Partial<Omit<EmailTemplate, "id" | "label" | "variables">>): void;
  resetTemplate(id: EmailTemplateId): void;
  updateSignature(patch: Partial<EmailSignature>): void;

  // backups
  backups: BackupRecord[];
  refreshBackups(): Promise<void>;
  createBackup(snapshot: BackupSnapshot): Promise<BackupRecord>;
  /** Restore returns the embedded snapshot on success so the caller can hand
   *  it to DataProvider.replaceAll + persist it for a window.reload. */
  restoreBackup(
    id: string
  ): Promise<
    | { ok: true; data: BackupSnapshot }
    | { ok: false; error: string }
  >;
  deleteBackup(id: string): Promise<{ ok: boolean; error?: string }>;
  /** Add a backup record from an uploaded JSON file. The caller has done the
   *  FileReader read; we own JSON parsing + structural validation. */
  importBackup(
    text: string,
    filename: string
  ): Promise<
    | { ok: true; record: BackupRecord }
    | { ok: false; error: string }
  >;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<AdminProfile>(DEFAULT_PROFILE);
  const [email, setEmail] = useState<EmailConfig>(DEFAULT_EMAIL);
  const [templates, setTemplates] = useState<EmailTemplate[]>(DEFAULT_TEMPLATES);
  const [signature, setSignature] = useState<EmailSignature>(DEFAULT_SIGNATURE);
  const [backups, setBackups] = useState<BackupRecord[]>([]);

  const refreshBackups = useCallback(async () => {
    const list = await getBackupService().list();
    setBackups(list);
  }, []);

  // Hydrate backups + SMTP password status on mount
  useEffect(() => {
    refreshBackups();
    fetch("/api/settings/email-status")
      .then((r) => (r.ok ? r.json() : { passwordConfigured: false }))
      .then((d: { passwordConfigured?: boolean }) => {
        setEmail((prev) => ({
          ...prev,
          passwordConfigured: !!d.passwordConfigured,
        }));
      })
      .catch(() => {
        // silent — UI shows "not configured"
      });
  }, [refreshBackups]);

  const updateProfile = useCallback((patch: Partial<AdminProfile>) => {
    setProfile((prev) => ({ ...prev, ...patch }));
  }, []);

  const changePassword = useCallback(
    async (): Promise<{ ok: boolean; error?: string }> => {
      // Real impl: server action that bcrypt-compares against User.passwordHash
      // and writes the new hash. Mocked here; updates the timestamp only.
      setProfile((prev) => ({
        ...prev,
        passwordUpdatedAt: new Date().toISOString(),
      }));
      return { ok: true };
    },
    []
  );

  const updateEmailConfig = useCallback((patch: Partial<EmailConfig>) => {
    setEmail((prev) => ({ ...prev, ...patch }));
  }, []);

  const requestPasswordReset = useCallback(async () => {
    // Mock: real impl would hit a server endpoint that emails a one-time link.
    return { ok: true };
  }, []);

  const updateTemplate = useCallback<
    SettingsContextValue["updateTemplate"]
  >((id, patch) => {
    setTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
    );
  }, []);

  const resetTemplate = useCallback((id: EmailTemplateId) => {
    const original = DEFAULT_TEMPLATES.find((t) => t.id === id);
    if (!original) return;
    setTemplates((prev) => prev.map((t) => (t.id === id ? original : t)));
  }, []);

  const updateSignature = useCallback((patch: Partial<EmailSignature>) => {
    setSignature((prev) => ({ ...prev, ...patch }));
  }, []);

  const createBackup = useCallback(
    async (snapshot: BackupSnapshot) => {
      const rec = await getBackupService().createNow(snapshot);
      await refreshBackups();
      return rec;
    },
    [refreshBackups]
  );

  const restoreBackup = useCallback(
    async (id: string) => {
      const result = await getBackupService().restore(id);
      await refreshBackups();
      return result;
    },
    [refreshBackups]
  );

  const deleteBackup = useCallback(
    async (id: string) => {
      const result = await getBackupService().delete(id);
      await refreshBackups();
      return result;
    },
    [refreshBackups]
  );

  const importBackup = useCallback(
    async (text: string, filename: string) => {
      const result = await getBackupService().importFromJson(text, filename);
      await refreshBackups();
      return result;
    },
    [refreshBackups]
  );

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings: { profile, email, templates, signature },
      updateProfile,
      changePassword,
      requestPasswordReset,
      updateEmailConfig,
      updateTemplate,
      resetTemplate,
      updateSignature,
      backups,
      refreshBackups,
      createBackup,
      restoreBackup,
      deleteBackup,
      importBackup,
    }),
    [
      profile,
      email,
      templates,
      signature,
      updateProfile,
      changePassword,
      requestPasswordReset,
      updateEmailConfig,
      updateTemplate,
      resetTemplate,
      updateSignature,
      backups,
      refreshBackups,
      createBackup,
      restoreBackup,
      deleteBackup,
      importBackup,
    ]
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx)
    throw new Error("useSettings must be used inside <SettingsProvider>");
  return ctx;
}
