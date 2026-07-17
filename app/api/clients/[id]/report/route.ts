import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { buildClientReportFilename } from "@/lib/client-report";
import { CARRIER_LOGOS } from "@/lib/carrier-logos";
import { parseTagList } from "@/lib/client-tags";
import { renderClientReportPdf } from "@/lib/client-report-pdf";
import { buildFamilySummary } from "@/lib/family";
import { parseInsuredPersonsJson } from "@/lib/policy-parties";
import type { Carrier, Client, ClientRelationship, Policy } from "@/lib/types";
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
  family?: {
    linkedClients?: Array<{ client: Client; relationship: string }>;
    policies?: Array<Policy & { owner: Client }>;
    insuranceFaceAmount?: number;
    investmentAum?: number;
  };
};

type ClientRow = Prisma.ClientGetPayload<{
  include: { emailHistory: true };
}>;
type PolicyRow = Prisma.PolicyGetPayload<{
  include: { beneficiaries: true };
}>;

async function fileToDataUri(candidate: string) {
  const buffer = await readFile(candidate);
  const ext = path.extname(candidate).toLowerCase();
  const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function getLogoDataUri() {
  const publicDir = path.join(/* turbopackIgnore: true */ process.cwd(), "public");
  const brandDir = path.join(publicDir, "brand");
  const candidates = [
    path.join(brandDir, "triton-logo-vertical.png"),
    path.join(brandDir, "triton-logo-signature.png"),
    path.join(brandDir, "triton-logo-horizontal.png"),
    path.join(publicDir, "triton-logo-vertical.png"),
  ];

  for (const candidate of candidates) {
    try {
      return await fileToDataUri(candidate);
    } catch {
      // Try the next known logo candidate.
    }
  }

  return undefined;
}

async function getCarrierLogoDataUris() {
  const publicDir = path.join(/* turbopackIgnore: true */ process.cwd(), "public");
  const entries = await Promise.all(
    Object.entries(CARRIER_LOGOS).map(async ([carrier, logoPath]) => {
      try {
        const normalizedPath = logoPath.startsWith("/") ? logoPath.slice(1) : logoPath;
        const dataUri = await fileToDataUri(path.join(publicDir, normalizedPath));
        return [carrier, dataUri] as const;
      } catch {
        return [carrier, undefined] as const;
      }
    })
  );

  return Object.fromEntries(
    entries.filter((entry): entry is readonly [Carrier, string] => Boolean(entry[1]))
  ) as Partial<Record<Carrier, string>>;
}

async function renderPdf(snapshot: ReportSnapshot) {
  const logoDataUri = await getLogoDataUri();
  const carrierLogoDataUris = await getCarrierLogoDataUris();
  return renderClientReportPdf({
    client: snapshot.client,
    policies: snapshot.policies,
    family: snapshot.family,
    logoDataUri,
    carrierLogoDataUris,
    generatedDate: new Date(),
  });
}

function dateOnly(value: Date | null | undefined) {
  return value?.toISOString().slice(0, 10);
}

function parseAttachments(value: string | null) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function serializeClient(row: ClientRow | Omit<ClientRow, "emailHistory">): Client {
  return {
    id: row.id,
    slug: row.slug ?? undefined,
    firstName: row.firstName,
    lastName: row.lastName,
    companyName: row.companyName ?? undefined,
    email: row.email,
    phone: row.phone ?? undefined,
    streetAddress: row.streetAddress ?? undefined,
    unit: row.unit ?? undefined,
    city: row.city ?? undefined,
    province: row.province as Client["province"],
    postalCode: row.postalCode ?? undefined,
    birthday: dateOnly(row.birthday),
    notes: row.notes ?? undefined,
    manualTags: parseTagList(row.manualTags),
    hiddenTags: parseTagList(row.hiddenTags),
    linkedToId: row.linkedToId ?? undefined,
    relationship: row.relationship as Client["relationship"],
    lastBirthdayEmailAt: row.lastBirthdayEmailAt?.toISOString(),
    lastContactedAt: row.lastContactedAt?.toISOString(),
    emailHistory: ("emailHistory" in row ? row.emailHistory : []).map((entry) => ({
      id: entry.id,
      date: entry.date.toISOString(),
      subject: entry.subject,
      body: entry.body,
      templateLabel: entry.templateLabel ?? undefined,
      policyId: entry.policyId ?? undefined,
      policyNumber: entry.policyNumber ?? undefined,
      policyLabel: entry.policyLabel ?? undefined,
      communicationType: entry.communicationType ?? undefined,
      attachments: parseAttachments(entry.attachments),
    })),
    createdAt: row.createdAt.toISOString(),
  };
}

function serializePolicy(policy: PolicyRow): Policy {
  return {
    id: policy.id,
    clientId: policy.clientId,
    carrier: policy.carrier as Policy["carrier"],
    category: policy.category as Policy["category"],
    productType: policy.productType as Policy["productType"],
    productName: policy.productName,
    policyNumber: policy.policyNumber,
    sumAssured: policy.sumAssured,
    premium: policy.premium,
    paymentFrequency: policy.paymentFrequency as Policy["paymentFrequency"],
    paymentTermYears: policy.paymentTermYears ?? undefined,
    effectiveDate: dateOnly(policy.effectiveDate) ?? "",
    premiumDate: policy.premiumDate ?? undefined,
    maturityDate: dateOnly(policy.maturityDate),
    status: policy.status as Policy["status"],
    isCorporateInsurance: policy.isCorporateInsurance,
    businessName: policy.businessName ?? undefined,
    isInvestmentLoan: policy.isInvestmentLoan,
    lender: policy.lender as Policy["lender"],
    loanAmount: policy.loanAmount ?? undefined,
    loanRate: policy.loanRate ?? undefined,
    ongoingInvestmentAmount: policy.ongoingInvestmentAmount ?? undefined,
    ongoingInvestmentFrequency: (policy.ongoingInvestmentFrequency ?? undefined) as Policy["ongoingInvestmentFrequency"],
    ongoingInvestmentFrequencyCustom: policy.ongoingInvestmentFrequencyCustom ?? undefined,
    ongoingInvestmentStartDate: dateOnly(policy.ongoingInvestmentStartDate),
    ongoingInvestmentEndDate: dateOnly(policy.ongoingInvestmentEndDate),
    isJoint: policy.isJoint,
    jointWithClientId: policy.jointWithClientId ?? undefined,
    policyOwnerName: policy.policyOwnerName ?? undefined,
    policyOwnerClientId: policy.policyOwnerClientId ?? undefined,
    policyOwner2Name: policy.policyOwner2Name ?? undefined,
    policyOwner2ClientId: policy.policyOwner2ClientId ?? undefined,
    insuredPersons: parseInsuredPersonsJson(policy.insuredPersons),
    notes: policy.notes ?? undefined,
    lastRenewalEmailAt: policy.lastRenewalEmailAt?.toISOString(),
    beneficiaries: policy.beneficiaries.map((beneficiary) => ({
      id: beneficiary.id,
      policyId: beneficiary.policyId,
      name: beneficiary.name,
      relationship: beneficiary.relationship as Policy["beneficiaries"][number]["relationship"],
      sharePercent: beneficiary.sharePercent,
    })),
  };
}

async function buildReportSnapshot(clientId: string, userId: string): Promise<ReportSnapshot | null> {
  const rootRow = await db.client.findFirst({
    where: { id: clientId, userId },
    include: {
      emailHistory: { orderBy: { date: "desc" } },
    },
  });
  if (!rootRow) return null;

  const rawRelationships = await db.clientRelationship.findMany({
    where: {
      OR: [{ fromClientId: clientId }, { toClientId: clientId }],
    },
  });
  const linkedIds = Array.from(new Set(
    rawRelationships.map((relationship) =>
      relationship.fromClientId === clientId
        ? relationship.toClientId
        : relationship.fromClientId
    )
  ));
  const linkedRows = linkedIds.length
    ? await db.client.findMany({ where: { id: { in: linkedIds }, userId } })
    : [];
  const members = [serializeClient(rootRow), ...linkedRows.map((row) => serializeClient(row))];
  const memberIds = new Set(members.map((member) => member.id));
  const relationships = rawRelationships
    .filter((relationship) =>
      memberIds.has(relationship.fromClientId) && memberIds.has(relationship.toClientId)
    )
    .map((relationship) => ({
      id: relationship.id,
      fromClientId: relationship.fromClientId,
      toClientId: relationship.toClientId,
      relationship: relationship.relationship as ClientRelationship["relationship"],
      createdAt: relationship.createdAt.toISOString(),
    }));

  const policyRows = await db.policy.findMany({
    where: {
      userId,
      OR: [
        { clientId: { in: Array.from(memberIds) } },
        { isJoint: true, jointWithClientId: { in: Array.from(memberIds) } },
      ],
    },
    include: { beneficiaries: true },
  });
  const familySummary = buildFamilySummary(
    members[0],
    members,
    policyRows.map(serializePolicy),
    relationships
  );
  const rootPolicies = policyRows
    .filter((policy) => policy.clientId === clientId)
    .map(serializePolicy);

  return {
    client: members[0],
    policies: rootPolicies,
    family: familySummary.linkedClients.length
      ? {
          linkedClients: familySummary.linkedClients.map((link) => ({
            client: link.client,
            relationship: link.relationship,
          })),
          policies: familySummary.policies,
          insuranceFaceAmount: familySummary.insuranceFaceAmount,
          investmentAum: familySummary.investmentAum,
        }
      : undefined,
  };
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

  const limited = rateLimit(`report:${session.user.id}:${getClientIp(_request)}`, {
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (!limited.ok) {
    return NextResponse.json({ ok: false, error: "Too many report downloads recently" }, { status: 429 });
  }

  const { id } = await context.params;
  const snapshot = await buildReportSnapshot(id, session.user.id);
  if (!snapshot) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }
  await auditLog({ action: "download_report", entityType: "client", entityId: id });
  const buffer = await renderPdf(snapshot);
  return pdfResponse(buffer, snapshot.client);
}
