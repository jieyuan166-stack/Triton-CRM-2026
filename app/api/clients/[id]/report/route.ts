import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { buildClientReportFilename } from "@/lib/client-report";
import { renderClientReportPdf } from "@/lib/client-report-pdf";
import type { Client, Policy } from "@/lib/types";
import { auditLog, requireSession, unauthorized } from "@/lib/api-security";
import { db } from "@/lib/db";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ReportSnapshot = {
  client: Client;
  policies: Policy[];
};

async function getLogoDataUri() {
  const publicDir = path.join(/* turbopackIgnore: true */ process.cwd(), "public");
  const candidates = [
    path.join(publicDir, "triton-logo-vertical.png"),
    path.join(publicDir, "LOGO PNG 竖版.png"),
    path.join(publicDir, "triton-logo.png"),
    path.join(publicDir, "logo.png"),
  ];

  for (const candidate of candidates) {
    try {
      const buffer = await readFile(candidate);
      const ext = path.extname(candidate).toLowerCase();
      const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
      return `data:${mime};base64,${buffer.toString("base64")}`;
    } catch {
      // Try the next known logo candidate.
    }
  }

  return undefined;
}

async function renderPdf(snapshot: ReportSnapshot) {
  const logoDataUri = await getLogoDataUri();
  return renderClientReportPdf({
    client: snapshot.client,
    policies: snapshot.policies,
    logoDataUri,
    generatedDate: new Date(),
  });
}

function pdfResponse(buffer: Buffer, client: Client) {
  const filename = buildClientReportFilename(client);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const { id } = await context.params;
  const row = await db.client.findUnique({
    where: { id },
    include: { policies: { include: { beneficiaries: true } } },
  });

  if (!row) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const client: Client = {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone ?? undefined,
    streetAddress: row.streetAddress ?? undefined,
    unit: row.unit ?? undefined,
    city: row.city ?? undefined,
    province: row.province as Client["province"],
    postalCode: row.postalCode ?? undefined,
    birthday: row.birthday?.toISOString().slice(0, 10),
    notes: row.notes ?? undefined,
    linkedToId: row.linkedToId ?? undefined,
    relationship: row.relationship as Client["relationship"],
    lastBirthdayEmailAt: row.lastBirthdayEmailAt?.toISOString(),
    lastContactedAt: row.lastContactedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
  const policies = row.policies.map((policy) => ({
    id: policy.id,
    clientId: policy.clientId,
    carrier: policy.carrier,
    category: policy.category,
    productType: policy.productType,
    productName: policy.productName,
    policyNumber: policy.policyNumber,
    sumAssured: policy.sumAssured,
    premium: policy.premium,
    paymentFrequency: policy.paymentFrequency,
    paymentTermYears: policy.paymentTermYears ?? undefined,
    effectiveDate: policy.effectiveDate.toISOString().slice(0, 10),
    premiumDate: policy.premiumDate ?? undefined,
    maturityDate: policy.maturityDate?.toISOString().slice(0, 10),
    status: policy.status,
    isCorporateInsurance: policy.isCorporateInsurance,
    businessName: policy.businessName ?? undefined,
    isInvestmentLoan: policy.isInvestmentLoan,
    lender: policy.lender ?? undefined,
    loanAmount: policy.loanAmount ?? undefined,
    loanRate: policy.loanRate ?? undefined,
    lastRenewalEmailAt: policy.lastRenewalEmailAt?.toISOString(),
    beneficiaries: policy.beneficiaries.map((b) => ({
      id: b.id,
      policyId: b.policyId,
      name: b.name,
      relationship: b.relationship,
      sharePercent: b.sharePercent,
    })),
  })) as Policy[];
  await auditLog({ action: "download_report", entityType: "client", entityId: id });
  const buffer = await renderPdf({ client, policies });
  return pdfResponse(buffer, client);
}

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const limited = rateLimit(`report:${session.user.id}:${getClientIp(request)}`, {
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (!limited.ok) {
    return NextResponse.json({ ok: false, error: "Too many report downloads recently" }, { status: 429 });
  }

  const snapshot = (await request.json()) as Partial<ReportSnapshot>;

  if (!snapshot.client || !Array.isArray(snapshot.policies)) {
    return NextResponse.json({ error: "Invalid report payload" }, { status: 400 });
  }

  const buffer = await renderPdf({
    client: snapshot.client,
    policies: snapshot.policies,
  });
  await auditLog({
    action: "download_report",
    entityType: "client",
    entityId: snapshot.client.id,
  });
  return pdfResponse(buffer, snapshot.client);
}
