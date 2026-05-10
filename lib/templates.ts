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

export const DEFAULT_TEMPLATES: EmailTemplate[] = [
  {
    id: "birthday",
    label: "Birthday",
    subject: "Happy Birthday from Triton Wealth!",
    body:
      "Hi [Client Name],\n\nWishing you a very happy birthday from all of us at Triton Wealth Management. May the year ahead bring you health, joy, and continued prosperity.\n\nWarm regards,",
    variables: ["[Client Name]", "[Date]"],
  },
  {
    id: "renewal",
    label: "Renewal",
    subject: "Premium Reminder · [Carrier] [Policy Name]",
    body:
      "Hi [Client Name],\n\nThis is a friendly reminder that your premium of [Premium Amount] for your [Carrier] [Policy Name] policy (face amount [Face Amount]) is due on [Date].\n\nLet me know if you have any questions or would like to review the policy.\n\nBest regards,",
    variables: [
      "[Client Name]",
      "[Carrier]",
      "[Policy Name]",
      "[Face Amount]",
      "[Premium Amount]",
      "[Date]",
    ],
  },
  {
    id: "festival",
    label: "Festival",
    subject: "Season's Greetings from Triton Wealth",
    body:
      "Hi [Client Name],\n\nWishing you and your family a wonderful holiday season. Thank you for your continued trust in Triton Wealth Management — it's a privilege to support your financial journey.\n\nHere's to a prosperous year ahead.\n\nWarm regards,",
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

/**
 * HTML email body for SMTP sends. Template copy stays plain-text/editable;
 * the signature can be true HTML from Settings. This keeps the compose
 * dialog simple while allowing Gmail/Outlook to render the rich signature.
 */
export function renderEmailHtml(
  body: string,
  vars: Record<string, string | undefined>,
  signature?: EmailSignature
): string {
  const filled = applyTemplate(body, vars);
  const bodyHtml = plainTextToEmailHtml(filled);
  const signatureHtml =
    signature?.enabled && signature.html?.trim()
      ? signature.html
      : signature?.enabled && signature.text.trim()
      ? plainTextToEmailHtml(signature.text)
      : "";
  const separator = filled.trim() && signatureHtml ? "<br /><br />" : "";

  return [
    '<div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #0F172A;">',
    bodyHtml,
    separator,
    signatureHtml
      ? `<div style="margin-top: 2px;">${signatureHtml}</div>`
      : "",
    "</div>",
  ].join("");
}
