import type { Client, Policy } from "@/lib/types";

function escapePdfText(value: unknown) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, "");
}

function line(text: string, y: number, size = 10) {
  return `BT /F1 ${size} Tf 50 ${y} Td (${escapePdfText(text)}) Tj ET`;
}

function clientName(client: Client) {
  return [client.firstName, client.lastName].filter(Boolean).join(" ").trim() || "Client";
}

export function buildFallbackClientPdf(client: Client, policies: Policy[]) {
  const lines = [
    line("TRITON WEALTH MANAGEMENT", 790, 16),
    line("Portfolio Review Report", 766, 13),
    line(`Client: ${clientName(client)}`, 730, 12),
    line(`Email: ${client.email || "Not provided"}`, 712),
    line(`Phone: ${client.phone || "Not provided"}`, 696),
    line(`Birthday: ${client.birthday || "Not provided"}`, 680),
    line(`Address: ${[client.streetAddress, client.city, client.province, client.postalCode].filter(Boolean).join(", ") || "Not provided"}`, 664),
    line("Products", 632, 13),
    ...policies.slice(0, 18).flatMap((policy, index) => {
      const y = 610 - index * 22;
      return [
        line(`${index + 1}. ${policy.carrier} | ${policy.category} | ${policy.productType}`, y),
        line(`   Policy ${policy.policyNumber || "N/A"} | Face ${policy.sumAssured || 0} | Premium ${policy.premium || 0}`, y - 12, 9),
      ];
    }),
    line("Disclosure", 156, 13),
    line("This report is for informational review only and should be verified against official carrier records.", 136, 9),
    line("Confidential client information. For authorized use only.", 122, 9),
  ];

  const content = lines.join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(content)} >> stream\n${content}\nendstream endobj`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${object}\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf);
}

