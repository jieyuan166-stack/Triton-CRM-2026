import type { Client, Policy } from "@/lib/types";
import { formatDate as formatCalendarDate } from "@/lib/date-utils";
import { formatCurrency as formatMoney } from "@/lib/format";

export type ClientReportPayload = {
  client: Client;
  policies: Policy[];
  logoDataUri?: string;
  generatedDate?: Date;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value?: string) {
  if (!value) return "Not provided";
  return formatCalendarDate(value, "en-CA");
}

function formatCurrency(value?: number) {
  return formatMoney(Number.isFinite(value) ? value ?? 0 : 0);
}

function clientName(client: Client) {
  return [client.firstName, client.lastName].filter(Boolean).join(" ").trim() || "Client";
}

function policyPartySummary(policy: Policy) {
  const parts = [];
  if (policy.policyOwnerName) parts.push(`Owner: ${policy.policyOwnerName}`);
  const insured = (policy.insuredPersons ?? [])
    .map((person) => person.name)
    .filter(Boolean)
    .join(" / ");
  if (insured) parts.push(`Insured: ${insured}`);
  return parts.join(" · ");
}

export function buildClientReportFilename(client: Client, generatedDate = new Date()) {
  const safeName = clientName(client).replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
  const date = generatedDate.toISOString().slice(0, 10);
  return `Triton_Portfolio_Review_${safeName || "Client"}_${date}.pdf`;
}

function buildAddress(client: Client) {
  return [
    client.streetAddress,
    client.unit ? `Unit ${client.unit}` : "",
    client.city,
    client.province,
    client.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

function buildPolicyRows(policies: Policy[]) {
  if (policies.length === 0) {
    return `
      <tr>
        <td colspan="8" class="empty-state">No products recorded for this client.</td>
      </tr>
    `;
  }

  return policies
    .map(
      (policy) => `
        <tr>
          <td>${escapeHtml(policy.carrier)}</td>
          <td>${escapeHtml(policy.category)}</td>
          <td>
            ${escapeHtml(policy.productType)}
            ${
              policyPartySummary(policy)
                ? `<div class="party-line">${escapeHtml(policyPartySummary(policy))}</div>`
                : ""
            }
          </td>
          <td>${escapeHtml(policy.policyNumber || "N/A")}</td>
          <td class="money">${formatCurrency(policy.sumAssured)}</td>
          <td class="money">${formatCurrency(policy.premium)}</td>
          <td>${escapeHtml(policy.paymentFrequency || "N/A")}</td>
          <td><span class="status">${escapeHtml(policy.status || "active")}</span></td>
        </tr>
      `,
    )
    .join("");
}

export function buildClientReportHtml({
  client,
  policies,
  logoDataUri,
  generatedDate = new Date(),
}: ClientReportPayload) {
  const name = clientName(client);
  const activePolicies = policies.filter((policy) => policy.status !== "lapsed");
  const totalFaceAmount = activePolicies.reduce((sum, policy) => sum + (policy.sumAssured || 0), 0);
  const totalPremium = activePolicies.reduce((sum, policy) => sum + (policy.premium || 0), 0);
  const address = buildAddress(client);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Triton Portfolio Review</title>
    <style>
      @page { size: A4; margin: 0; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: #111827;
        font-family: "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif;
        font-size: 11px;
        line-height: 1.42;
        background: #ffffff;
      }
      .page {
        width: 210mm;
        height: 297mm;
        padding: 16mm 17mm 14mm;
        background: #ffffff;
        overflow: hidden;
      }
      .page + .page { page-break-before: always; }
      .top-rule {
        height: 4px;
        width: 100%;
        border-radius: 999px;
        background: linear-gradient(90deg, #002147 0%, #002147 76%, #c9a227 76%, #c9a227 100%);
        margin-bottom: 18px;
      }
      .page-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 24px;
        margin-bottom: 22px;
      }
      .logo {
        width: 122px;
        max-height: 122px;
        object-fit: contain;
      }
      .brand-fallback {
        color: #002147;
        font-size: 18px;
        font-weight: 700;
        letter-spacing: 0.05em;
      }
      .header-meta {
        text-align: right;
        color: #64748b;
        font-size: 10px;
        padding-top: 2px;
      }
      .report-chip {
        display: inline-block;
        margin-bottom: 9px;
        border: 1px solid #d9e0e7;
        border-radius: 999px;
        color: #002147;
        font-size: 8.5px;
        font-weight: 700;
        letter-spacing: 0.14em;
        padding: 4px 9px;
        text-transform: uppercase;
      }
      .eyebrow {
        color: #c9a227;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }
      h1 {
        margin: 7px 0 6px;
        color: #002147;
        font-family: "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif;
        font-size: 31px;
        font-weight: 500;
        line-height: 1.08;
      }
      h2 {
        margin: 0;
        color: #002147;
        font-size: 14px;
        letter-spacing: 0.01em;
      }
      .subtitle {
        margin: 0 0 18px;
        color: #64748b;
        font-size: 11.5px;
        max-width: 520px;
      }
      .metrics {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 9px;
        margin: 18px 0 16px;
      }
      .metric {
        border: 1px solid #e7ebef;
        border-radius: 10px;
        padding: 12px 13px;
        background: #fbfcfd;
      }
      .metric-label {
        color: #64748b;
        font-size: 8.5px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .metric-value {
        margin-top: 5px;
        color: #002147;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 18px;
        font-weight: 700;
      }
      .section {
        margin-top: 12px;
        border: 1px solid #e7ebef;
        border-radius: 12px;
        background: #ffffff;
        overflow: hidden;
      }
      .section-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 11px 14px;
        background: #f8fafc;
        border-bottom: 1px solid #e7ebef;
      }
      .section-number {
        color: #c9a227;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.14em;
      }
      .section-body { padding: 12px 14px; }
      .client-table, .products-table {
        width: 100%;
        border-collapse: collapse;
      }
      .client-table td {
        padding: 5px 0;
        vertical-align: top;
      }
      .client-table td:first-child {
        width: 128px;
        color: #64748b;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .products-table th {
        color: #64748b;
        font-size: 8.2px;
        font-weight: 700;
        letter-spacing: 0.08em;
        padding: 8px 7px;
        text-align: left;
        text-transform: uppercase;
        border-bottom: 1px solid #e7ebef;
        white-space: nowrap;
      }
      .products-table td {
        padding: 8px 7px;
        border-bottom: 1px solid #f1f5f9;
        vertical-align: top;
      }
      .money {
        font-family: Arial, Helvetica, sans-serif;
      }
      .party-line {
        margin-top: 3px;
        color: #64748b;
        font-size: 8.8px;
        line-height: 1.35;
      }
      .products-table tr:last-child td { border-bottom: 0; }
      .status {
        display: inline-block;
        border-radius: 999px;
        padding: 2px 7px;
        background: #ecfdf5;
        color: #047857;
        font-size: 9px;
        font-weight: 700;
        text-transform: capitalize;
      }
      .empty-state {
        color: #94a3b8;
        padding: 16px 8px;
        text-align: center;
      }
      .footer-note {
        margin-top: 14px;
        color: #94a3b8;
        font-size: 9.5px;
      }
      .footer-line {
        position: absolute;
        left: 17mm;
        right: 17mm;
        bottom: 12mm;
        display: flex;
        align-items: center;
        justify-content: space-between;
        color: #94a3b8;
        font-size: 9px;
        border-top: 1px solid #eef2f6;
        padding-top: 8px;
      }
      .disclosure {
        margin-top: 28px;
        color: #334155;
        font-size: 10.5px;
        max-width: 700px;
      }
      .disclosure p { margin: 0 0 12px; }
    </style>
  </head>
  <body>
    <section class="page">
      <div class="top-rule"></div>
      <header class="page-header">
        ${
          logoDataUri
            ? `<img class="logo" src="${logoDataUri}" alt="Triton Wealth Management" />`
            : `<div class="brand-fallback">TRITON WEALTH</div>`
        }
        <div class="header-meta">
          <div class="report-chip">Portfolio Review</div>
          <div>Prepared for ${escapeHtml(name)}</div>
          <div>Generated ${escapeHtml(formatDate(generatedDate.toISOString()))}</div>
        </div>
      </header>

      <div class="eyebrow">Client Portfolio Review</div>
      <h1>${escapeHtml(name)}</h1>
      <p class="subtitle">A concise relationship overview prepared for review, planning, and product record accuracy.</p>

      <div class="metrics">
        <div class="metric">
          <div class="metric-label">Products</div>
          <div class="metric-value">${policies.length}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Total Death Benefit</div>
          <div class="metric-value">${formatCurrency(totalFaceAmount)}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Total Premium</div>
          <div class="metric-value">${formatCurrency(totalPremium)}</div>
        </div>
      </div>

      <section class="section">
        <div class="section-title">
          <h2>Client Information</h2>
          <div class="section-number">01</div>
        </div>
        <div class="section-body">
          <table class="client-table">
            <tbody>
              <tr><td>Name</td><td>${escapeHtml(name)}</td></tr>
              <tr><td>Email</td><td>${escapeHtml(client.email || "Not provided")}</td></tr>
              <tr><td>Phone</td><td>${escapeHtml(client.phone || "Not provided")}</td></tr>
              <tr><td>Birthday</td><td>${escapeHtml(formatDate(client.birthday))}</td></tr>
              <tr><td>Address</td><td>${escapeHtml(address || "Not provided")}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="section">
        <div class="section-title">
          <h2>Products</h2>
          <div class="section-number">02</div>
        </div>
        <div class="section-body">
          <table class="products-table">
            <thead>
              <tr>
                <th>Carrier</th>
                <th>Category</th>
                <th>Product</th>
                <th>Policy #</th>
                <th>Death Benefit</th>
                <th>Premium</th>
                <th>Frequency</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${buildPolicyRows(policies)}</tbody>
          </table>
        </div>
      </section>

      <p class="footer-note">Generated from Triton CRM records. Please verify against official carrier documents before client delivery.</p>
      <div class="footer-line">
        <span>Triton Wealth Management Corporation</span>
        <span>Confidential</span>
      </div>
    </section>

    <section class="page">
      <div class="top-rule"></div>
      <header class="page-header">
        ${
          logoDataUri
            ? `<img class="logo" src="${logoDataUri}" alt="Triton Wealth Management" />`
            : `<div class="brand-fallback">TRITON WEALTH</div>`
        }
        <div class="header-meta"><div class="report-chip">Disclosure</div></div>
      </header>

      <div class="eyebrow">Important Information</div>
      <h1>Disclosure</h1>
      <div class="disclosure">
        <p>This report is provided for informational and review purposes only. It is not intended to constitute legal, tax, accounting, insurance, investment, or other professional advice. Product values, premiums, policy status, and other details should be verified against official carrier records before any decision is made.</p>
        <p>Insurance and investment products may involve risk, limitations, exclusions, fees, surrender charges, tax implications, and other considerations. Past performance, where applicable, is not a guarantee of future results. Recommendations should be made only after a full review of the client's objectives, risk tolerance, financial circumstances, and applicable regulatory requirements.</p>
        <p>Confidentiality notice: this document contains private client information and is intended only for authorized recipients. If received in error, please delete it and notify the sender immediately.</p>
      </div>
      <div class="footer-line">
        <span>Triton Wealth Management Corporation</span>
        <span>Page 2</span>
      </div>
    </section>
  </body>
</html>`;
}
