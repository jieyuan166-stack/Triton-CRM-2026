// lib/templates.ts
// Email-template defaults + variable interpolation.
//
// Variables in template text use the form `[Variable Name]` (square brackets,
// case-sensitive, spaces allowed). At send time the host computes a context
// object and we substitute via `applyTemplate(text, vars)`. Unknown variables
// are left intact so the user can spot typos.

import {
  SIGNATURE_TEMPLATES,
  htmlToPlainText,
  prepareSignatureForEmail,
} from "./signature-templates";
import type { EmailSignature, EmailTemplate } from "./settings-types";
import { sanitizeEmailHtml } from "./security/sanitize-html";

export const BIRTHDAY_CARD_TOKEN = "[Birthday Card]";
export const FESTIVAL_CARD_TOKEN = "[Festival Card]";
export const MID_AUTUMN_CAMPAIGN_KEY = "mid-autumn-2026";
// Keep a versioned public URL for Gmail's image proxy. Replacing a file at a
// stable path can leave Gmail mobile showing a stale, unrelated image.
export const BIRTHDAY_CARD_IMAGE_URL = "https://crm.tritonwealth.ca/email/birthday-greeting-v4.png";
export const MID_AUTUMN_CARD_IMAGE_URL = "https://crm.tritonwealth.ca/email/mid-autumn-2026-v1.jpg";
const BIRTHDAY_CARD_ADVISOR_EMAILS = new Set(["jieyuan165@gmail.com"]);

export function shouldIncludeBirthdayCardForAdvisor(email?: string | null): boolean {
  return BIRTHDAY_CARD_ADVISOR_EMAILS.has((email ?? "").trim().toLowerCase());
}

export function birthdayCardImageHtml(): string {
  // A numeric width attribute is required for Gmail mobile. Percentage width
  // attributes on images are inconsistently interpreted by its image proxy.
  return `<img src="${BIRTHDAY_CARD_IMAGE_URL}" width="600" alt="Happy Birthday from Triton Wealth" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;border-radius:12px;" />`;
}

export function festivalCardImageHtml(): string {
  return `<img src="${MID_AUTUMN_CARD_IMAGE_URL}" width="520" alt="Mid-Autumn Festival greetings from Triton Wealth" style="display:block;width:100%;max-width:520px;height:auto;border:0;outline:none;text-decoration:none;border-radius:10px;" />`;
}

export const LEGACY_DEFAULT_TEMPLATE_COPY: Record<string, { subject: string; body: string }> = {
  birthday: {
    subject: "Happy Birthday from Triton Wealth!",
    body:
      "Hi [Client Name],\n\nWishing you a very happy birthday from all of us at Triton Wealth Management. May the year ahead bring you health, joy, and continued prosperity.\n\nWarm regards,",
  },
  renewal: {
    subject: "Premium Reminder · [Carrier] [Policy Name]",
    body:
      "Hi [Client Name],\n\nThis is a friendly reminder that your premium of [Premium Amount] for your [Carrier] [Policy Name] policy (total coverage [Total Coverage]) is due on [Date].\n\nLet me know if you have any questions or would like to review the policy.\n\nBest regards,",
  },
  festival: {
    subject: "Season's Greetings from Triton Wealth",
    body:
      "Hi [Client Name],\n\nWishing you and your family a wonderful holiday season. Thank you for your continued trust in Triton Wealth Management — it's a privilege to support your financial journey.\n\nHere's to a prosperous year ahead.\n\nWarm regards,",
  },
};

export const DEFAULT_TEMPLATES: EmailTemplate[] = [
  {
    id: "birthday",
    label: "Birthday",
    subject: "生日祝福 / Happy Birthday from Jeffrey Yuan",
    body:
      "尊敬的 [Client Name]，\n\nJeffrey Yuan 诚挚祝您生日快乐！\n\n愿您在新的一岁里身体健康、万事顺遂、幸福美满、事业兴旺。感谢您一直以来的信任与支持，我们也期待在未来继续为您提供专业服务。\n\n祝您度过一个愉快而难忘的生日！\n\n诚挚问候，\n\nDear [Client Name],\n\nWishing you a very happy birthday from Jeffrey Yuan.\n\nMay the year ahead bring you good health, happiness, success, and continued prosperity. We truly appreciate your trust and support, and we look forward to continuing to serve you in the years ahead.\n\nEnjoy your special day!\n\nWarm regards,",
    attachments: [],
    variables: ["[Client Name]", "[Date]"],
  },
  {
    id: "renewal",
    label: "Renewal",
    subject: "[Reminder Stage] · 保费缴费提醒 / Premium Payment Reminder · [Carrier] [Policy Name] · #[Policy Number]",
    body:
      "尊敬的 [Client Name]，\n\n您好！\n\n[Reminder Stage]\n\n温馨提醒您，您在 [Carrier] 的 [Policy Name] 保单（保单号码：[Policy Number]，总保障额度：[Total Coverage]）保费 [Premium Amount] 将于 [Date] 到期。\n\n为确保您的保障持续有效并避免保障中断，请您在到期日前完成缴费。如您对保单内容有任何疑问，或希望重新检视您的保障规划，欢迎随时与我联系。\n\n如果您已经完成缴费，请忽略此提醒。\n\n感谢您一直以来的信任与支持！\n\n<sub>* 如果您是 Manulife Vitality 客户，实际保费会根据您的 Vitality 等级调整，具体金额请以 statement 为准。</sub>\n\nDear [Client Name],\n\nI hope you are doing well.\n\n[Reminder Stage]\n\nThis is a friendly reminder that the premium payment of [Premium Amount] for your [Carrier] [Policy Name] policy, policy number [Policy Number], with total coverage of [Total Coverage], is due on [Date].\n\nTo ensure your coverage remains active and uninterrupted, please arrange the payment before the due date. Should you have any questions regarding your policy or if you would like to schedule a review of your coverage, please feel free to contact me at any time.\n\nIf you have already made the payment, please disregard this reminder.\n\nThank you for your continued trust and support.\n\nBest regards,\n\n<sub>* If you are a Manulife Vitality client, actual premium varies by your Vitality status — please refer to your statement for the current amount.</sub>",
    attachments: [],
    variables: [
      "[Client Name]",
      "[Carrier]",
      "[Policy Name]",
      "[Policy Number]",
      "[Total Coverage]",
      "[Death Benefit]",
      "[Face Amount]",
      "[Premium Amount]",
      "[Date]",
      "[Reminder Stage]",
    ],
  },
  {
    id: "festival",
    label: "Festival",
    subject: "月满中秋，阖家安康｜Happy Mid-Autumn Festival",
    body:
      "尊敬的 [Client Name]：\n\n金秋送爽，丹桂飘香。值此中秋佳节，谨向您及家人致以最诚挚的节日祝福。\n\n愿一轮明月寄托团圆与美好，愿您阖家安康、喜乐常伴、万事顺遂。\n\n感谢您一直以来对富瑞财富及我的信任与支持。祝您中秋快乐，月圆人团圆！\n\n诚挚问候，\n\nDear [Client Name],\n\nAs the full moon lights up the Mid-Autumn Festival, I would like to extend my warmest wishes to you and your family.\n\nMay this season of reunion bring you good health, happiness, peace, and continued success.\n\nThank you sincerely for your continued trust and support. Wishing you and your loved ones a joyful Mid-Autumn Festival filled with warmth and togetherness.\n\nWarm regards,\n\n[Festival Card]",
    attachments: [],
    variables: ["[Client Name]"],
  },
];

export const DEFAULT_SIGNATURE: EmailSignature = {
  enabled: true,
  text: htmlToPlainText(SIGNATURE_TEMPLATES[1].html),
  html: SIGNATURE_TEMPLATES[1].html,
};

/**
 * Replace `[Variable Name]` placeholders with values from `vars`.
 * Unknown placeholders are preserved verbatim — that surfaces typos in the
 * template when the advisor previews it.
 */
export function applyTemplate(
  text: string | undefined | null,
  vars: Record<string, string | undefined>
): string {
  // Defensive: a missing template (e.g., after restoring an older snapshot
  // that didn't carry templates) used to crash here with "Cannot read
  // properties of undefined (reading 'replace')". Treat any non-string as
  // an empty template so the compose dialog opens with blank subject/body
  // instead of white-screening the whole tab.
  if (typeof text !== "string" || text.length === 0) return "";
  return text.replace(/\[([^\]\n]+)\]/g, (match, name: string) => {
    const v = vars[name];
    return v === undefined ? match : v;
  });
}

/**
 * Apply both a template body and an optional signature in one shot.
 * The signature is appended with a blank line separator.
 */
export function renderEmailBody(
  body: string,
  vars: Record<string, string | undefined>,
  signature?: { enabled: boolean; text: string }
): string {
  const filled = removeEmailMediaTokens(applyTemplate(body, vars));
  if (!signature?.enabled || !signature.text.trim()) return filled;
  return `${filled}\n\n${signature.text}`;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function plainTextToEmailHtml(text: string): string {
  return escapeHtml(removeEmailMediaTokens(text))
    .replace(/&lt;sub&gt;/gi, '<sub style="font-size: 11px; color: #64748B;">')
    .replace(/&lt;\/sub&gt;/gi, "</sub>")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n/g, "<br />");
}

export function removeBirthdayCardToken(text: string): string {
  return text
    .replace(new RegExp(`\\n{0,2}${escapeRegExp(BIRTHDAY_CARD_TOKEN)}\\n{0,2}`, "g"), "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

export function removeFestivalCardToken(text: string): string {
  return text
    .replace(new RegExp(`\\n{0,2}${escapeRegExp(FESTIVAL_CARD_TOKEN)}\\n{0,2}`, "g"), "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

export function removeEmailMediaTokens(text: string): string {
  return removeFestivalCardToken(removeBirthdayCardToken(text));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function emphasizeHtmlTerms(html: string, terms: string[] | undefined): string {
  if (!terms?.length) return html;
  return terms
    .map((term) => term.trim())
    .filter(Boolean)
    .reduce((nextHtml, term) => {
      const escaped = escapeHtml(term);
      return nextHtml.replace(
        new RegExp(escapeRegExp(escaped), "g"),
        `<strong><em>${escaped}</em></strong>`
      );
    }, html);
}

/**
 * HTML email body for SMTP sends. Template copy stays plain-text/editable;
 * the signature can be true HTML from Settings. This keeps the compose
 * dialog simple while allowing Gmail/Outlook to render the rich signature.
 */
export function renderEmailHtml(
  body: string,
  vars: Record<string, string | undefined>,
  signature?: EmailSignature,
  options?: {
    emphasizedTerms?: string[];
    template?: "birthday" | "renewal" | "festival" | "custom";
    birthdayCardEnabled?: boolean;
    inlineHtmlBeforeSignature?: string;
  }
): string {
  const rawFilled = applyTemplate(body, vars);
  const hasFestivalCard =
    options?.template === "festival" && rawFilled.includes(FESTIVAL_CARD_TOKEN);
  const filled = removeEmailMediaTokens(rawFilled);
  const bodyHtml = emphasizeHtmlTerms(
    plainTextToEmailHtml(filled),
    options?.emphasizedTerms
  );
  const rawSignatureHtml =
    signature?.enabled && signature.html?.trim()
      ? signature.html
      : signature?.enabled && signature.text.trim()
      ? plainTextToEmailHtml(signature.text)
      : "";
  const signatureHtml = rawSignatureHtml
    ? prepareSignatureForEmail(sanitizeEmailHtml(rawSignatureHtml))
    : "";
  const birthdayCardHtml =
    options?.template === "birthday" && options.birthdayCardEnabled !== false
      ? birthdayCardImageHtml()
      : "";
  const festivalCardHtml = hasFestivalCard ? festivalCardImageHtml() : "";
  const inlineHtmlBeforeSignature = options?.inlineHtmlBeforeSignature?.trim() ?? "";
  const rows = [
    bodyHtml
      ? `<tr><td style="font-family:Geist,-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#0F172A;word-break:normal;overflow-wrap:anywhere;">${bodyHtml}</td></tr>`
      : "",
    birthdayCardHtml
      ? `<tr><td align="center" style="padding:18px 0 12px;">${birthdayCardHtml}</td></tr>`
      : "",
    festivalCardHtml
      ? `<tr><td align="center" style="padding:20px 0 12px;">${festivalCardHtml}</td></tr>`
      : "",
    inlineHtmlBeforeSignature
      ? `<tr><td style="padding-top:12px;">${inlineHtmlBeforeSignature}</td></tr>`
      : "",
    signatureHtml
      ? `<tr><td style="padding-top:${bodyHtml || birthdayCardHtml || festivalCardHtml || inlineHtmlBeforeSignature ? "20px" : "0"};">${signatureHtml}</td></tr>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  // Each section is a sibling row. Gmail mobile can misplace nested tables
  // embedded directly after text, which previously allowed a signature image
  // to appear where the birthday card should have been.
  return [
    '<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="100%" style="width:100%;border-collapse:collapse;background-color:#FFFFFF;">',
    '<tr><td align="center" style="padding:0 16px;">',
    '<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="600" style="width:100%;max-width:600px;border-collapse:collapse;">',
    rows,
    "</table></td></tr></table>",
  ].join("");
}
