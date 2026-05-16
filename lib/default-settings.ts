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
    const previousRenewalDefaults =
      defaultTemplate.id === "renewal"
        ? [
            {
              subject: "Premium Payment Reminder · [Carrier] [Policy Name]",
              body:
                "Dear [Client Name],\n\nI hope you are doing well.\n\nThis is a friendly reminder that the premium payment of [Premium Amount] for your [Carrier] [Policy Name] policy, with a face amount of [Face Amount], is due on [Date].\n\nTo ensure your coverage remains active and uninterrupted, please arrange the payment before the due date. Should you have any questions regarding your policy or if you would like to schedule a review of your coverage, please feel free to contact me at any time.\n\nThank you for your continued trust and support.\n\nBest regards,\n\n尊敬的 [Client Name]，\n\n您好！\n\n温馨提醒您，您在 [Carrier] 的 [Policy Name] 保单（保额：[Face Amount]）保费 [Premium Amount] 将于 [Date] 到期。\n\n为确保您的保障持续有效并避免保障中断，请您在到期日前完成缴费。如您对保单内容有任何疑问，或希望重新检视您的保障规划，欢迎随时与我联系。\n\n感谢您一直以来的信任与支持！",
            },
            {
              subject: "Premium Payment Reminder · [Carrier] [Policy Name]",
              body:
                "Dear [Client Name],\n\nI hope you are doing well.\n\nThis is a friendly reminder that the premium payment of [Premium Amount] for your [Carrier] [Policy Name] policy, with a death benefit of [Death Benefit], is due on [Date].\n\nTo ensure your coverage remains active and uninterrupted, please arrange the payment before the due date. Should you have any questions regarding your policy or if you would like to schedule a review of your coverage, please feel free to contact me at any time.\n\nThank you for your continued trust and support.\n\nBest regards,\n\n尊敬的 [Client Name]，\n\n您好！\n\n温馨提醒您，您在 [Carrier] 的 [Policy Name] 保单（保额：[Death Benefit]）保费 [Premium Amount] 将于 [Date] 到期。\n\n为确保您的保障持续有效并避免保障中断，请您在到期日前完成缴费。如您对保单内容有任何疑问，或希望重新检视您的保障规划，欢迎随时与我联系。\n\n感谢您一直以来的信任与支持！",
            },
            {
              subject: "Premium Payment Reminder · [Carrier] [Policy Name] · #[Policy Number]",
              body:
                "Dear [Client Name],\n\nI hope you are doing well.\n\nThis is a friendly reminder that the premium payment of [Premium Amount] for your [Carrier] [Policy Name] policy, policy number [Policy Number], with a death benefit of [Death Benefit], is due on [Date].\n\nTo ensure your coverage remains active and uninterrupted, please arrange the payment before the due date. Should you have any questions regarding your policy or if you would like to schedule a review of your coverage, please feel free to contact me at any time.\n\nThank you for your continued trust and support.\n\nBest regards,\n\n尊敬的 [Client Name]，\n\n您好！\n\n温馨提醒您，您在 [Carrier] 的 [Policy Name] 保单（保单号码：[Policy Number]，保额：[Death Benefit]）保费 [Premium Amount] 将于 [Date] 到期。\n\n为确保您的保障持续有效并避免保障中断，请您在到期日前完成缴费。如您对保单内容有任何疑问，或希望重新检视您的保障规划，欢迎随时与我联系。\n\n感谢您一直以来的信任与支持！",
            },
            {
              subject: "Premium Payment Reminder · [Carrier] [Policy Name] · #[Policy Number]",
              body:
                "Dear [Client Name],\n\nI hope you are doing well.\n\nThis is a friendly reminder that the premium payment of [Premium Amount] for your [Carrier] [Policy Name] policy, policy number [Policy Number], with a death benefit of [Death Benefit], is due on [Date].\n\nTo ensure your coverage remains active and uninterrupted, please arrange the payment before the due date. Should you have any questions regarding your policy or if you would like to schedule a review of your coverage, please feel free to contact me at any time.\n\nIf you have already made the payment, please disregard this reminder.\n\nThank you for your continued trust and support.\n\nBest regards,\n\n<sub>Manulife Vitality clients: Actual premium varies by your Vitality status — please refer to your statement for the current amount.</sub>\n\n尊敬的 [Client Name]，\n\n您好！\n\n温馨提醒您，您在 [Carrier] 的 [Policy Name] 保单（保单号码：[Policy Number]，保额：[Death Benefit]）保费 [Premium Amount] 将于 [Date] 到期。\n\n为确保您的保障持续有效并避免保障中断，请您在到期日前完成缴费。如您对保单内容有任何疑问，或希望重新检视您的保障规划，欢迎随时与我联系。\n\n如果您已经完成缴费，请忽略此提醒。\n\n感谢您一直以来的信任与支持！\n\n<sub>Manulife Vitality 客户：实际保费会根据您的 Vitality 等级调整，具体金额请以 statement 为准。</sub>",
            },
          ]
        : [];
    const subject =
      typeof saved.subject === "string" &&
      saved.subject !== legacy?.subject &&
      !previousRenewalDefaults.some((template) => saved.subject === template.subject)
        ? saved.subject
        : defaultTemplate.subject;
    const body =
      typeof saved.body === "string" &&
      saved.body !== legacy?.body &&
      !previousRenewalDefaults.some((template) => saved.body === template.body)
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

function mergeSignature(input: unknown): AppSettings["signature"] {
  const raw =
    input && typeof input === "object"
      ? (input as Partial<AppSettings["signature"]>)
      : {};
  const merged = { ...DEFAULT_APP_SETTINGS.signature, ...raw };

  // Upgrade the previous default signature layout in-place. It used inline
  // contact spans, which let mobile email clients split "Email:" and the
  // address onto separate lines. If the advisor has a clearly custom
  // signature, keep it untouched.
  if (
    typeof raw.html === "string" &&
    raw.html.includes("Jeffrey Yuan") &&
    raw.html.includes("Independent Broker") &&
    (
      raw.html.includes("padding: 0 8px;") ||
      raw.html.includes("data:image/") ||
      raw.html.includes("broker-badge") ||
      raw.html.includes("/brand/signature/mdrt-tot.jpg") ||
      !raw.html.includes("/brand/signature/mdrt-tot-transparent.png")
    ) &&
    raw.html.includes("jieyuan165@gmail.com")
  ) {
    return DEFAULT_APP_SETTINGS.signature;
  }

  return merged;
}

export function mergeAppSettings(input: unknown): AppSettings {
  if (!input || typeof input !== "object") return DEFAULT_APP_SETTINGS;
  const raw = input as Partial<AppSettings>;
  return {
    profile: { ...DEFAULT_APP_SETTINGS.profile, ...(raw.profile ?? {}) },
    email: { ...DEFAULT_APP_SETTINGS.email, ...(raw.email ?? {}) },
    templates: mergeEmailTemplates(raw.templates),
    signature: mergeSignature(raw.signature),
  };
}
