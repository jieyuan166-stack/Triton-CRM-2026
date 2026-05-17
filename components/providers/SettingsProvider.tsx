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
import { getBackupService, type RestoreBackupResult } from "@/lib/backup-service";
import { buildDefaultSettingsForUser } from "@/lib/default-settings";
import { useAuth } from "@/components/providers/AuthProvider";

interface SettingsContextValue {
  settings: AppSettings;
  // mutations
  updateProfile(patch: Partial<AdminProfile>): void;
  changePassword(current: string, next: string): Promise<{ ok: boolean; error?: string }>;
  requestPasswordReset(): Promise<{ ok: boolean }>;
  updateEmailConfig(patch: Partial<EmailConfig>): void;
  updateWeeklyDigest(patch: Partial<AppSettings["weeklyDigest"]>): void;
  updateEmailAutomation(patch: Partial<AppSettings["emailAutomation"]>): void;

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
  restoreBackup(id: string): Promise<RestoreBackupResult>;
  deleteBackup(id: string): Promise<{ ok: boolean; error?: string }>;
  setBackupImportant(id: string, important: boolean): Promise<{ ok: boolean; error?: string }>;
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
  const { session } = useAuth();
  const userDefaults = useMemo(
    () => buildDefaultSettingsForUser({
      id: session?.user?.id ?? "user",
      email: session?.user?.email ?? "",
      name: session?.user?.name ?? "",
    }),
    [session?.user?.email, session?.user?.id, session?.user?.name],
  );

  const [profile, setProfile] = useState(userDefaults.profile);
  const [email, setEmail] = useState<EmailConfig>(userDefaults.email);
  const [weeklyDigest, setWeeklyDigest] = useState(userDefaults.weeklyDigest);
  const [emailAutomation, setEmailAutomation] = useState(userDefaults.emailAutomation);
  const [templates, setTemplates] = useState<EmailTemplate[]>(userDefaults.templates);
  const [signature, setSignature] = useState<EmailSignature>(userDefaults.signature);
  const [backups, setBackups] = useState<BackupRecord[]>([]);

  const persistSettings = useCallback((next: Partial<AppSettings>) => {
    void fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => {
      // The UI remains responsive if a background settings write fails;
      // the next explicit save/action will surface API errors where needed.
    });
  }, []);

  const refreshBackups = useCallback(async () => {
    const list = await getBackupService().list();
    setBackups(list);
  }, []);

  // Reset to the current user's defaults before hydrating persisted settings,
  // so a newly-created advisor never sees another advisor's profile/template
  // during the short fetch window.
  useEffect(() => {
    setProfile(userDefaults.profile);
    setEmail(userDefaults.email);
    setWeeklyDigest(userDefaults.weeklyDigest);
    setEmailAutomation(userDefaults.emailAutomation);
    setTemplates(userDefaults.templates);
    setSignature(userDefaults.signature);
    setBackups([]);
  }, [session?.user?.id, userDefaults]);

  // Hydrate persisted Settings, backups + SMTP password status on account change.
  useEffect(() => {
    if (!session?.user?.id) return;
    refreshBackups();
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { settings?: AppSettings } | null) => {
        if (!d?.settings) return;
        setProfile(d.settings.profile);
        setEmail((prev) => ({
          ...d.settings!.email,
          passwordConfigured: prev.passwordConfigured,
        }));
        setWeeklyDigest(d.settings.weeklyDigest ?? userDefaults.weeklyDigest);
        setEmailAutomation(d.settings.emailAutomation ?? userDefaults.emailAutomation);
        setTemplates(d.settings.templates);
        setSignature(d.settings.signature);
      })
      .catch(() => {
        // Defaults keep the app usable if Settings cannot hydrate.
      });
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
  }, [refreshBackups, session?.user?.id, userDefaults]);

  const updateProfile = useCallback<SettingsContextValue["updateProfile"]>((patch) => {
    setProfile((prev) => {
      const next = { ...prev, ...patch };
      persistSettings({ profile: next });
      return next;
    });
  }, [persistSettings]);

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
    setEmail((prev) => {
      const next = { ...prev, ...patch };
      persistSettings({ email: next });
      return next;
    });
  }, [persistSettings]);

  const updateWeeklyDigest = useCallback(
    (patch: Partial<AppSettings["weeklyDigest"]>) => {
      setWeeklyDigest((prev) => {
        const next = { ...prev, ...patch };
        persistSettings({ weeklyDigest: next });
        return next;
      });
    },
    [persistSettings]
  );

  const updateEmailAutomation = useCallback(
    (patch: Partial<AppSettings["emailAutomation"]>) => {
      setEmailAutomation((prev) => {
        const next = { ...prev, ...patch };
        persistSettings({ emailAutomation: next });
        return next;
      });
    },
    [persistSettings]
  );

  const requestPasswordReset = useCallback(async () => {
    // Mock: real impl would hit a server endpoint that emails a one-time link.
    return { ok: true };
  }, []);

  const updateTemplate = useCallback<
    SettingsContextValue["updateTemplate"]
  >((id, patch) => {
    setTemplates((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, ...patch } : t));
      persistSettings({ templates: next });
      return next;
    });
  }, [persistSettings]);

  const resetTemplate = useCallback((id: EmailTemplateId) => {
    const original = userDefaults.templates.find((t) => t.id === id);
    if (!original) return;
    setTemplates((prev) => {
      const next = prev.map((t) => (t.id === id ? original : t));
      persistSettings({ templates: next });
      return next;
    });
  }, [persistSettings, userDefaults.templates]);

  const updateSignature = useCallback((patch: Partial<EmailSignature>) => {
    setSignature((prev) => {
      const next = { ...prev, ...patch };
      persistSettings({ signature: next });
      return next;
    });
  }, [persistSettings]);

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
      if (result.ok) {
        setBackups((prev) => prev.filter((backup) => backup.id !== id));
      }
      await refreshBackups();
      return result;
    },
    [refreshBackups]
  );

  const setBackupImportant = useCallback(
    async (id: string, important: boolean) => {
      const result = await getBackupService().setImportant(id, important);
      if (result.ok) {
        setBackups((prev) =>
          prev.map((backup) =>
            backup.id === id ? { ...backup, important } : backup
          )
        );
      }
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
      settings: { profile, email, weeklyDigest, emailAutomation, templates, signature },
      updateProfile,
      changePassword,
      requestPasswordReset,
      updateEmailConfig,
      updateWeeklyDigest,
      updateEmailAutomation,
      updateTemplate,
      resetTemplate,
      updateSignature,
      backups,
      refreshBackups,
      createBackup,
      restoreBackup,
      deleteBackup,
      setBackupImportant,
      importBackup,
    }),
    [
      profile,
      email,
      weeklyDigest,
      emailAutomation,
      templates,
      signature,
      updateProfile,
      changePassword,
      requestPasswordReset,
      updateEmailConfig,
      updateWeeklyDigest,
      updateEmailAutomation,
      updateTemplate,
      resetTemplate,
      updateSignature,
      backups,
      refreshBackups,
      createBackup,
      restoreBackup,
      deleteBackup,
      setBackupImportant,
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
