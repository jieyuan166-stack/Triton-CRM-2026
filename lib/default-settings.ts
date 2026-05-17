import type {
  AdminProfile,
  AppSettings,
  EmailConfig,
  WeeklyDigestConfig,
  EmailAutomationConfig,
} from "@/lib/settings-types";
import { DEFAULT_SIGNATURE, DEFAULT_TEMPLATES, LEGACY_DEFAULT_TEMPLATE_COPY } from "@/lib/templates";

export type SettingsUser = {
  id: string;
  email?: string | null;
  name?: string | null;
};

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

export const DEFAULT_WEEKLY_DIGEST: WeeklyDigestConfig = {
  enabled: false,
  weekday: "monday",
  time: "08:00",
  recipientEmail: "jieyuan165@gmail.com",
};

export const DEFAULT_EMAIL_AUTOMATION: EmailAutomationConfig = {
  premiumRemindersEnabled: false,
  birthdayGreetingsEnabled: false,
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  profile: DEFAULT_PROFILE,
  email: DEFAULT_EMAIL,
  weeklyDigest: DEFAULT_WEEKLY_DIGEST,
  emailAutomation: DEFAULT_EMAIL_AUTOMATION,
  templates: DEFAULT_TEMPLATES,
  signature: DEFAULT_SIGNATURE,
};


function genericTemplatesForUser(user: SettingsUser): AppSettings["templates"] {
  const advisorName = user.name?.trim() || "your advisor";
  return DEFAULT_TEMPLATES.map((template) => ({
    ...template,
    subject: template.subject.replaceAll("Jeffrey Yuan", advisorName),
    body: template.body
      .replaceAll("Jeffrey Yuan", advisorName)
      .replaceAll("continued trust in Jeffrey Yuan", "continued trust")
      .replaceAll("对 Jeffrey Yuan 的信任与支持", "对我们的信任与支持"),
  }));
}

export function buildDefaultSettingsForUser(user: SettingsUser): AppSettings {
  const email = user.email?.trim() || "";
  const name = user.name?.trim() || (email ? email.split("@")[0] : "Advisor");

  if (email.toLowerCase() === "jieyuan165@gmail.com") {
    return DEFAULT_APP_SETTINGS;
  }

  return {
    profile: {
      id: user.id,
      name,
      email,
      passwordUpdatedAt: undefined,
    },
    email: {
      ...DEFAULT_EMAIL,
      user: "",
      fromName: name,
      fromEmail: email,
      passwordConfigured: false,
    },
    weeklyDigest: {
      ...DEFAULT_WEEKLY_DIGEST,
      recipientEmail: email,
    },
    emailAutomation: DEFAULT_EMAIL_AUTOMATION,
    templates: genericTemplatesForUser(user),
    signature: {
      enabled: false,
      text: "",
      html: "",
    },
  };
}

function mergeEmailTemplates(input: unknown, defaults: AppSettings): AppSettings["templates"] {
  if (!Array.isArray(input) || input.length === 0) return defaults.templates;
  return defaults.templates.map((defaultTemplate) => {
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
    const previousBirthdayDefaults =
      defaultTemplate.id === "birthday"
        ? [
            {
              subject: "Happy Birthday from Jeffrey Yuan",
              body:
                "Dear [Client Name],\n\nWishing you a very happy birthday from Jeffrey Yuan.\n\nMay the year ahead bring you good health, happiness, success, and continued prosperity. We truly appreciate your trust and support, and we look forward to continuing to serve you in the years ahead.\n\nEnjoy your special day!\n\nWarm regards,\n\n尊敬的 [Client Name]，\n\nJeffrey Yuan 诚挚祝您生日快乐！\n\n愿您在新的一岁里身体健康、万事顺遂、幸福美满、事业兴旺。感谢您一直以来的信任与支持，我们也期待在未来继续为您提供专业服务。\n\n祝您度过一个愉快而难忘的生日！\n\n诚挚问候",
            },
            {
              subject: "Happy Birthday from Jeffrey Yuan",
              body:
                "Dear [Client Name],\n\nWishing you a very happy birthday from Jeffrey Yuan.\n\nMay the year ahead bring you good health, happiness, success, and continued prosperity. We truly appreciate your trust and support, and we look forward to continuing to serve you in the years ahead.\n\nEnjoy your special day!\n\nWarm regards,\n\n尊敬的 [Client Name]，\n\nJeffrey Yuan 诚挚祝您生日快乐！\n\n愿您在新的一岁里身体健康、万事顺遂、幸福美满、事业兴旺。感谢您一直以来的信任与支持，我们也期待在未来继续为您提供专业服务。\n\n祝您度过一个愉快而难忘的生日！\n\n诚挚问候\n\n[Birthday Card]",
            },
            {
              subject: "Happy Birthday from Jeffrey Yuan",
              body:
                "Dear [Client Name],\n\n[Birthday Card]\n\nWishing you a very happy birthday from Jeffrey Yuan.\n\nMay the year ahead bring you good health, happiness, success, and continued prosperity. We truly appreciate your trust and support, and we look forward to continuing to serve you in the years ahead.\n\nEnjoy your special day!\n\nWarm regards,\n\n尊敬的 [Client Name]，\n\nJeffrey Yuan 诚挚祝您生日快乐！\n\n愿您在新的一岁里身体健康、万事顺遂、幸福美满、事业兴旺。感谢您一直以来的信任与支持，我们也期待在未来继续为您提供专业服务。\n\n祝您度过一个愉快而难忘的生日！\n\n诚挚问候",
            },
          ]
        : [];
    const savedSubject = typeof saved.subject === "string" ? saved.subject : undefined;
    const savedBody = typeof saved.body === "string" ? saved.body : undefined;
    const isDefaultLikeTemplate =
      savedSubject === legacy?.subject ||
      savedBody === legacy?.body ||
      previousRenewalDefaults.some((template) => savedSubject === template.subject || savedBody === template.body) ||
      previousBirthdayDefaults.some((template) => savedSubject === template.subject || savedBody === template.body);
    const subject =
      typeof saved.subject === "string" &&
      saved.subject !== legacy?.subject &&
      !previousRenewalDefaults.some((template) => saved.subject === template.subject) &&
      !previousBirthdayDefaults.some((template) => saved.subject === template.subject)
        ? saved.subject
        : defaultTemplate.subject;
    const body =
      typeof saved.body === "string" &&
      saved.body !== legacy?.body &&
      !previousRenewalDefaults.some((template) => saved.body === template.body) &&
      !previousBirthdayDefaults.some((template) => saved.body === template.body)
        ? saved.body
        : defaultTemplate.body;

    return {
      ...defaultTemplate,
      ...saved,
      subject,
      body,
      attachments:
        defaultTemplate.id === "birthday" && isDefaultLikeTemplate
          ? defaultTemplate.attachments
          : Array.isArray(saved.attachments)
          ? saved.attachments
          : defaultTemplate.attachments,
      variables: defaultTemplate.variables,
    };
  });
}

function mergeSignature(input: unknown, defaults: AppSettings): AppSettings["signature"] {
  const raw =
    input && typeof input === "object"
      ? (input as Partial<AppSettings["signature"]>)
      : {};
  const merged = { ...defaults.signature, ...raw };

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
    return defaults.signature;
  }

  return merged;
}

export function mergeAppSettings(input: unknown, defaults: AppSettings = DEFAULT_APP_SETTINGS): AppSettings {
  if (!input || typeof input !== "object") return defaults;
  const raw = input as Partial<AppSettings>;
  return {
    profile: { ...defaults.profile, ...(raw.profile ?? {}) },
    email: { ...defaults.email, ...(raw.email ?? {}) },
    weeklyDigest: {
      ...defaults.weeklyDigest,
      ...(raw.weeklyDigest ?? {}),
    },
    emailAutomation: {
      ...defaults.emailAutomation,
      ...(raw.emailAutomation ?? {}),
    },
    templates: mergeEmailTemplates(raw.templates, defaults),
    signature: mergeSignature(raw.signature, defaults),
  };
}
