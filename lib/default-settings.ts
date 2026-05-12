import type { AdminProfile, AppSettings, EmailConfig } from "@/lib/settings-types";
import { DEFAULT_SIGNATURE, DEFAULT_TEMPLATES, LEGACY_DEFAULT_TEMPLATE_COPY } from "@/lib/templates";

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


function mergeEmailTemplates(input: unknown): AppSettings["templates"] {
  if (!Array.isArray(input) || input.length === 0) return DEFAULT_APP_SETTINGS.templates;
  return DEFAULT_TEMPLATES.map((defaultTemplate) => {
    const saved = input.find(
      (template): template is Partial<(typeof DEFAULT_TEMPLATES)[number]> & { id: string } =>
        !!template && typeof template === "object" && (template as { id?: unknown }).id === defaultTemplate.id
    );
    if (!saved) return defaultTemplate;

    const legacy = LEGACY_DEFAULT_TEMPLATE_COPY[defaultTemplate.id];
    const subject =
      typeof saved.subject === "string" && saved.subject !== legacy?.subject
        ? saved.subject
        : defaultTemplate.subject;
    const body =
      typeof saved.body === "string" && saved.body !== legacy?.body
        ? saved.body
        : defaultTemplate.body;

    return {
      ...defaultTemplate,
      ...saved,
      subject,
      body,
      attachments: Array.isArray(saved.attachments) ? saved.attachments : defaultTemplate.attachments,
      variables: defaultTemplate.variables,
    };
  });
}

export function mergeAppSettings(input: unknown): AppSettings {
  if (!input || typeof input !== "object") return DEFAULT_APP_SETTINGS;
  const raw = input as Partial<AppSettings>;
  return {
    profile: { ...DEFAULT_APP_SETTINGS.profile, ...(raw.profile ?? {}) },
    email: { ...DEFAULT_APP_SETTINGS.email, ...(raw.email ?? {}) },
    templates: mergeEmailTemplates(raw.templates),
    signature: { ...DEFAULT_APP_SETTINGS.signature, ...(raw.signature ?? {}) },
  };
}
