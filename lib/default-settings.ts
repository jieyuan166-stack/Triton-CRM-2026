import type { AdminProfile, AppSettings, EmailConfig } from "@/lib/settings-types";
import { DEFAULT_SIGNATURE, DEFAULT_TEMPLATES } from "@/lib/templates";

export const DEFAULT_PROFILE: AdminProfile = {
  id: "user_admin",
  name: "Jeffrey Y",
  email: "jieyuan165@gmail.com",
  passwordUpdatedAt: undefined,
};

export const DEFAULT_EMAIL: EmailConfig = {
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  user: "jieyuan165@gmail.com",
  fromName: "Jeffrey Yuan",
  fromEmail: "jieyuan165@gmail.com",
  passwordConfigured: false,
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  profile: DEFAULT_PROFILE,
  email: DEFAULT_EMAIL,
  templates: DEFAULT_TEMPLATES,
  signature: DEFAULT_SIGNATURE,
};

export function mergeAppSettings(input: unknown): AppSettings {
  if (!input || typeof input !== "object") return DEFAULT_APP_SETTINGS;
  const raw = input as Partial<AppSettings>;
  return {
    profile: { ...DEFAULT_APP_SETTINGS.profile, ...(raw.profile ?? {}) },
    email: { ...DEFAULT_APP_SETTINGS.email, ...(raw.email ?? {}) },
    templates:
      Array.isArray(raw.templates) && raw.templates.length > 0
        ? raw.templates
        : DEFAULT_APP_SETTINGS.templates,
    signature: { ...DEFAULT_APP_SETTINGS.signature, ...(raw.signature ?? {}) },
  };
}
