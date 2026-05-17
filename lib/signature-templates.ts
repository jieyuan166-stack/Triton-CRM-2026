// lib/signature-templates.ts
//
// Pre-designed HTML signature presets the advisor can drop into the
// rich-text editor on Settings -> Templates with one click.
//
// Images intentionally use public HTTPS URLs instead of base64/cid inline
// attachments. Gmail/Outlook may show cid images as attachments, which looks
// unprofessional for a signature.

export interface SignatureTemplate {
  id: "minimalist" | "corporate";
  label: string;
  description: string;
  /** Inline-styled HTML. Drop straight into contenteditable / nodemailer. */
  html: string;
}

export interface SignatureTemplateAdvisor {
  name?: string | null;
  email?: string | null;
}

const NAVY = "#0F172A";
const ACCENT = "#3B82F6";
const MUTED = "#64748B";
const BORDER = "#E2E8F0";
const PUBLIC_ORIGIN = "https://crm.tritonwealth.ca";

const TRITON_LOGO_URL = `${PUBLIC_ORIGIN}/brand/triton-logo-signature.png`;
const MDRT_BADGE_URL = `${PUBLIC_ORIGIN}/brand/signature/mdrt-tot-transparent.png`;
const RRC_BADGE_URL = `${PUBLIC_ORIGIN}/brand/signature/rrc-logo.png`;
const CSC_BADGE_URL = `${PUBLIC_ORIGIN}/brand/signature/csc.png`;

const credentialBadges = `
<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin: 9px 0 8px;">
  <tr>
    <td style="vertical-align: middle; padding-right: 5px;">
      <img src="${MDRT_BADGE_URL}" alt="MDRT Top of the Table Member" width="31" style="display: block; width: 31px; height: auto; border: 0;" />
    </td>
    <td style="vertical-align: middle; padding-right: 5px;">
      <img src="${RRC_BADGE_URL}" alt="Registered Retirement Consultant" width="76" style="display: block; width: 76px; height: auto; border: 0;" />
    </td>
    <td style="vertical-align: middle;">
      <img src="${CSC_BADGE_URL}" alt="Canadian Securities Course Completed" width="27" style="display: block; width: 27px; height: auto; border: 0;" />
    </td>
  </tr>
</table>`.trim();

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function advisorContact(advisor?: SignatureTemplateAdvisor) {
  const email = advisor?.email?.trim() || "advisor@example.com";
  const name = advisor?.name?.trim() || (email.includes("@") ? email.split("@")[0] : "Advisor");
  const isJeffrey = email.toLowerCase() === "jieyuan165@gmail.com" || /jeffrey\s+yuan/i.test(name);
  const isClaire = email.toLowerCase() === "claireq6886@gmail.com" || /claire\s+q/i.test(name);
  const phone = isJeffrey ? "778-837-6688" : isClaire ? "604-345-5188" : "";
  return {
    name: escapeHtml(name),
    email: escapeHtml(email),
    showCredentialBadges: isJeffrey,
    phoneLine: phone
      ? `<div style="margin-bottom: 3px;">
        <span style="white-space: nowrap;">Cell: <a href="tel:+1${phone.replace(/\D/g, "")}" style="color: ${ACCENT}; text-decoration: none;">${phone}</a></span>
        ${isJeffrey ? `
        <span style="padding: 0 8px; color: ${BORDER};">|</span>
        <span style="white-space: nowrap;">Fax: 604-261-2193</span>` : ""}
      </div>`
      : "",
  };
}

// Minimalist: Broker Disclaimer.
function minimalistTemplate(advisor?: SignatureTemplateAdvisor) {
  const contact = advisorContact(advisor);
  return `
<div style="font-family: Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif; color: ${NAVY};">
  <div style="font-size: 14px; line-height: 1.5;">
    <div style="font-weight: 700; font-size: 15px; color: ${NAVY};">${contact.name}</div>
    <div style="font-weight: 400; font-size: 12px; color: ${MUTED}; margin-top: 1px;">Independent Broker</div>
    ${contact.showCredentialBadges ? credentialBadges : ""}
    <div style="margin-top: 6px; color: ${MUTED}; font-size: 12px;">
      <div style="margin-bottom: 3px;">#1200-1200 W. 73rd Ave. Vancouver, BC V6P 6G5</div>
      ${contact.phoneLine}
      <div style="margin-bottom: 3px; white-space: nowrap;">Email: <a href="mailto:${contact.email}" style="color: ${ACCENT}; text-decoration: none;">${contact.email}</a></div>
      <div style="white-space: nowrap;">Web: <a href="https://www.tritonwealth.ca" style="color: ${ACCENT}; text-decoration: none;">tritonwealth.ca</a></div>
    </div>
  </div>

  <div style="margin-top: 14px; border-top: 1px solid ${BORDER}; padding-top: 10px;">
    <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.08em; color: ${NAVY}; text-transform: uppercase;">Notice of Confidentiality</div>
    <p style="margin: 8px 0 0; font-size: 10.5px; line-height: 1.55; color: ${MUTED};">
      This communication is confidential, may be privileged and is intended for the exclusive use of the addressee. Any other person is strictly prohibited from disclosing, distributing or reproducing it. If the addressee cannot be reached or is unknown to you, please inform the sender by return e-mail immediately and delete this e-mail message and destroy all copies. Please note that email is not a secure medium for the transmission of highly sensitive data. Thank you.
    </p>
    <p style="margin: 8px 0 0; font-size: 10.5px; line-height: 1.55; color: ${MUTED};">
      Cette communication est confidentielle, peut etre privilegiee et est a l'intention exclusive du destinataire. Toutes autres personnes sont strictement defendues de divulguer, de distribuer ou de reproduire cette communication. Si le destinataire ne peut etre joint ou est pour vous inconnu, veuillez s'il vous plait informer l'expediteur en repondant a ce courriel immediatement et supprimer et detruire ce message courriel et toutes les copies. Veuillez noter que le courriel n'est pas un moyen secure pour la transmission des donnees de haute sensitivite. Merci.
    </p>
  </div>
</div>`.trim();
}

// Corporate: Two-column layout with Triton logo + full contact info.
function corporateTemplate(advisor?: SignatureTemplateAdvisor) {
  const contact = advisorContact(advisor);
  return `
<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="font-family: Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif; font-size: 13px; line-height: 1.55; color: ${NAVY};">
  <tr>
    <td style="vertical-align: top; padding-right: 16px; border-right: 2px solid ${ACCENT};">
      <img src="${TRITON_LOGO_URL}" width="80" alt="Triton Wealth Management" style="display: block; border-radius: 8px; border: 0;" />
    </td>
    <td style="vertical-align: top; padding-left: 16px;">
      <div style="font-weight: 700; font-size: 15px; color: ${NAVY};">${contact.name}</div>
      <div style="color: ${MUTED}; font-size: 12px; margin-top: 2px;">Independent Broker</div>
      ${contact.showCredentialBadges ? credentialBadges : ""}
      <div style="color: ${NAVY}; font-size: 12px; margin-top: 6px; font-weight: 600;">Triton Wealth Management Corporation</div>
      <div style="color: ${MUTED}; font-size: 12px; margin-top: 3px;">#1200-1200 W. 73rd Ave. Vancouver, BC V6P 6G5</div>
      <div style="margin-top: 6px; color: ${MUTED}; font-size: 12px;">
        ${contact.phoneLine}
        <div style="white-space: nowrap;">Email: <a href="mailto:${contact.email}" style="color: ${ACCENT}; text-decoration: none;">${contact.email}</a></div>
        <div>Web: <a href="https://www.tritonwealth.ca" style="color: ${ACCENT}; text-decoration: none;">tritonwealth.ca</a></div>
      </div>
    </td>
  </tr>
</table>`.trim();
}

export function getSignatureTemplates(advisor?: SignatureTemplateAdvisor): SignatureTemplate[] {
  return [
    {
      id: "minimalist",
      label: "Broker Disclaimer",
      description: "Official broker contact block with confidentiality notice.",
      html: minimalistTemplate(advisor),
    },
    {
      id: "corporate",
      label: "Corporate (with image)",
      description: "Two-column table layout with Triton logo on the left.",
      html: corporateTemplate(advisor),
    },
  ];
}

export const SIGNATURE_TEMPLATES: SignatureTemplate[] = getSignatureTemplates({
  name: "Jeffrey Yuan",
  email: "jieyuan165@gmail.com",
});

/** Strip HTML tags + decode common entities for the plain-text fallback.
 *  Cheap, dependency-free, and good enough for a signature (a few lines).
 *  Block elements get a newline so the result isn't all on one line. */
export function htmlToPlainText(html: string): string {
  if (!html) return "";
  return html
    // Treat block-ish closes as line breaks before stripping tags.
    .replace(/<\/?(div|p|tr|li|h[1-6])\s*\/?>/gi, "\n")
    // Remove all remaining tags.
    .replace(/<[^>]+>/g, "")
    // Decode common entities.
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    // Collapse 3+ newlines into two.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
