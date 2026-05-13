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
} from "./signature-templates";
import type { EmailSignature, EmailTemplate } from "./settings-types";

export const LEGACY_DEFAULT_TEMPLATE_COPY: Record<string, { subject: string; body: string }> = {
  birthday: {
    subject: "Happy Birthday from Triton Wealth!",
    body:
      "Hi [Client Name],\n\nWishing you a very happy birthday from all of us at Triton Wealth Management. May the year ahead bring you health, joy, and continued prosperity.\n\nWarm regards,",
  },
  renewal: {
    subject: "Premium Reminder · [Carrier] [Policy Name]",
    body:
      "Hi [Client Name],\n\nThis is a friendly reminder that your premium of [Premium Amount] for your [Carrier] [Policy Name] policy (face amount [Face Amount]) is due on [Date].\n\nLet me know if you have any questions or would like to review the policy.\n\nBest regards,",
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
    subject: "Happy Birthday from Jeffrey Yuan",
    body:
      "Dear [Client Name],\n\nWishing you a very happy birthday from Jeffrey Yuan.\n\nMay the year ahead bring you good health, happiness, success, and continued prosperity. We truly appreciate your trust and support, and we look forward to continuing to serve you in the years ahead.\n\nEnjoy your special day!\n\nWarm regards,\n\n尊敬的 [Client Name]，\n\nJeffrey Yuan 诚挚祝您生日快乐！\n\n愿您在新的一岁里身体健康、万事顺遂、幸福美满、事业兴旺。感谢您一直以来的信任与支持，我们也期待在未来继续为您提供专业服务。\n\n祝您度过一个愉快而难忘的生日！\n\n诚挚问候",
    attachments: [],
    variables: ["[Client Name]", "[Date]"],
  },
  {
    id: "renewal",
    label: "Renewal",
    subject: "Premium Payment Reminder · [Carrier] [Policy Name] · #[Policy Number]",
    body:
      "Dear [Client Name],\n\nI hope you are doing well.\n\nThis is a friendly reminder that the premium payment of [Premium Amount] for your [Carrier] [Policy Name] policy, policy number [Policy Number], with a face amount of [Face Amount], is due on [Date].\n\nTo ensure your coverage remains active and uninterrupted, please arrange the payment before the due date. Should you have any questions regarding your policy or if you would like to schedule a review of your coverage, please feel free to contact me at any time.\n\nThank you for your continued trust and support.\n\nBest regards,\n\n尊敬的 [Client Name]，\n\n您好！\n\n温馨提醒您，您在 [Carrier] 的 [Policy Name] 保单（保单号码：[Policy Number]，保额：[Face Amount]）保费 [Premium Amount] 将于 [Date] 到期。\n\n为确保您的保障持续有效并避免保障中断，请您在到期日前完成缴费。如您对保单内容有任何疑问，或希望重新检视您的保障规划，欢迎随时与我联系。\n\n感谢您一直以来的信任与支持！",
    attachments: [],
    variables: [
      "[Client Name]",
      "[Carrier]",
      "[Policy Name]",
      "[Policy Number]",
      "[Face Amount]",
      "[Premium Amount]",
      "[Date]",
    ],
  },
  {
    id: "festival",
    label: "Festival",
    subject: "Holiday Greetings from Jeffrey Yuan",
    body:
      "Dear [Client Name],\n\nWishing you and your family a joyful and peaceful holiday season.\n\nThank you for your continued trust in Jeffrey Yuan. It is truly a privilege to support you on your financial journey, and we sincerely appreciate the opportunity to serve you.\n\nMay the coming year bring you happiness, good health, and continued prosperity.\n\nWarm regards,\n\n尊敬的 [Client Name]，\n\n值此佳节来临之际，谨向您和您的家人致以最诚挚的节日祝福，愿您度过一个温馨、快乐的假期。\n\n感谢您一直以来对 Jeffrey Yuan 的信任与支持。能够陪伴并协助您实现财务目标，是我们的荣幸，我们也衷心感谢您给予我们的信赖。\n\n祝愿您在新的一年里身体健康、阖家幸福、事业顺利、万事兴旺！\n\n诚挚问候",
    attachments: [],
    variables: ["[Client Name]"],
  },
];

export const DEFAULT_SIGNATURE: EmailSignature = {
  enabled: true,
  text: htmlToPlainText(SIGNATURE_TEMPLATES[0].html),
  html: SIGNATURE_TEMPLATES[0].html,
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
  const filled = applyTemplate(body, vars);
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
  return escapeHtml(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n/g, "<br />");
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
  options?: { emphasizedTerms?: string[] }
): string {
  const filled = applyTemplate(body, vars);
  const bodyHtml = emphasizeHtmlTerms(
    plainTextToEmailHtml(filled),
    options?.emphasizedTerms
  );
  const signatureHtml =
    signature?.enabled && signature.html?.trim()
      ? signature.html
      : signature?.enabled && signature.text.trim()
      ? plainTextToEmailHtml(signature.text)
      : "";
  const separator = filled.trim() && signatureHtml ? "<br /><br />" : "";

  return [
    '<div style="font-family: Geist, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, sans-serif; font-size: 14px; line-height: 1.6; color: #0F172A;">',
    bodyHtml,
    separator,
    signatureHtml
      ? `<div style="margin-top: 2px;">${signatureHtml}</div>`
      : "",
    "</div>",
  ].join("");
}
