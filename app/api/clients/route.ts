import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { auditLog, requireSession, unauthorized } from "@/lib/api-security";
import { parseClientQueryParams, queryClients } from "@/lib/clients-query";
import { TAG_VALUES } from "@/lib/constants";
import { parseTagList } from "@/lib/client-tags";
import { normalizeClientNotes } from "@/lib/communication-notes";
import { db } from "@/lib/db";
import { parseInsuredPersonsJson } from "@/lib/policy-parties";
import { normalizeSearchText, toTitleCaseName } from "@/lib/text-utils";
import { clientFormSchema } from "@/lib/validators";
import type { Client, FollowUp, Policy } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function policySearchWhere(token: string): Prisma.PolicyWhereInput {
  return {
    OR: [
      { carrier: { contains: token } },
      { productType: { contains: token } },
      { productName: { contains: token } },
      { policyNumber: { contains: token } },
      { businessName: { contains: token } },
      { lender: { contains: token } },
      { policyOwnerName: { contains: token } },
      { policyOwner2Name: { contains: token } },
      { insuredPersons: { contains: token } },
    ],
  };
}

function buildClientWhere(query: ReturnType<typeof parseClientQueryParams>, userId: string): Prisma.ClientWhereInput {
  const and: Prisma.ClientWhereInput[] = [{ userId }];

  if (query.provinces?.length) {
    and.push({ province: { in: query.provinces } });
  }

  const tokens = normalizeSearchText(query.search).split(" ").filter(Boolean);
  for (const token of tokens) {
    const policyWhere = policySearchWhere(token);
    and.push({
      OR: [
        { firstName: { contains: token } },
        { lastName: { contains: token } },
        { companyName: { contains: token } },
        { email: { contains: token } },
        { phone: { contains: token } },
        { streetAddress: { contains: token } },
        { unit: { contains: token } },
        { city: { contains: token } },
        { province: { contains: token } },
        { postalCode: { contains: token } },
        { policies: { some: policyWhere } },
      ],
    });
  }

  return and.length ? { AND: and } : {};
}

function mapClientRow(c: Awaited<ReturnType<typeof db.client.findMany>>[number]): Client {
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    companyName: c.companyName ?? undefined,
    email: c.email,
    phone: c.phone ?? undefined,
    streetAddress: c.streetAddress ?? undefined,
    unit: c.unit ?? undefined,
    city: c.city ?? undefined,
    province: c.province as Client["province"],
    postalCode: c.postalCode ?? undefined,
    birthday: c.birthday?.toISOString().slice(0, 10),
    notes: c.notes ?? undefined,
    manualTags: parseTagList(c.manualTags),
    hiddenTags: parseTagList(c.hiddenTags),
    linkedToId: c.linkedToId ?? undefined,
    relationship: c.relationship as Client["relationship"],
    emailHistory: "emailHistory" in c && Array.isArray(c.emailHistory)
      ? c.emailHistory.map((entry) => ({
          id: entry.id,
          date: entry.date.toISOString(),
          subject: entry.subject,
          body: entry.body,
          templateLabel: entry.templateLabel ?? undefined,
          policyId: entry.policyId ?? undefined,
          policyNumber: entry.policyNumber ?? undefined,
          policyLabel: entry.policyLabel ?? undefined,
          communicationType: entry.communicationType ?? undefined,
        }))
      : undefined,
    lastBirthdayEmailAt: c.lastBirthdayEmailAt?.toISOString(),
    lastContactedAt: c.lastContactedAt?.toISOString(),
    createdAt: c.createdAt.toISOString(),
  };
}

function mapPolicyRow(p: Awaited<ReturnType<typeof db.policy.findMany>>[number]): Policy {
  return {
    id: p.id,
    clientId: p.clientId,
    carrier: p.carrier,
    category: p.category,
    productType: p.productType,
    productName: p.productName,
    policyNumber: p.policyNumber,
    sumAssured: p.sumAssured,
    premium: p.premium,
    paymentFrequency: p.paymentFrequency,
    paymentTermYears: p.paymentTermYears ?? undefined,
    effectiveDate: p.effectiveDate.toISOString().slice(0, 10),
    premiumDate: p.premiumDate ?? undefined,
    maturityDate: p.maturityDate?.toISOString().slice(0, 10),
    status: p.status,
    isCorporateInsurance: p.isCorporateInsurance,
    businessName: p.businessName ?? undefined,
    isInvestmentLoan: p.isInvestmentLoan,
    lender: p.lender ?? undefined,
    loanAmount: p.loanAmount ?? undefined,
    loanRate: p.loanRate ?? undefined,
    ongoingInvestmentAmount: p.ongoingInvestmentAmount ?? undefined,
    ongoingInvestmentFrequency: (p.ongoingInvestmentFrequency ?? undefined) as Policy["ongoingInvestmentFrequency"],
    ongoingInvestmentFrequencyCustom: p.ongoingInvestmentFrequencyCustom ?? undefined,
    ongoingInvestmentStartDate: p.ongoingInvestmentStartDate?.toISOString().slice(0, 10),
    ongoingInvestmentEndDate: p.ongoingInvestmentEndDate?.toISOString().slice(0, 10),
    isJoint: p.isJoint,
    jointWithClientId: p.jointWithClientId ?? undefined,
    policyOwnerName: p.policyOwnerName ?? undefined,
    policyOwnerClientId: p.policyOwnerClientId ?? undefined,
    policyOwner2Name: p.policyOwner2Name ?? undefined,
    policyOwner2ClientId: p.policyOwner2ClientId ?? undefined,
    insuredPersons: parseInsuredPersonsJson(p.insuredPersons),
    lastRenewalEmailAt: p.lastRenewalEmailAt?.toISOString(),
    beneficiaries: "beneficiaries" in p && Array.isArray(p.beneficiaries)
      ? p.beneficiaries.map((b) => ({
          id: b.id,
          policyId: b.policyId,
          name: b.name,
          relationship: b.relationship,
          sharePercent: b.sharePercent,
        }))
      : [],
  } as Policy;
}

function mapFollowUpRow(
  f: Awaited<ReturnType<typeof db.followUp.findMany>>[number] & {
    createdBy?: { name: string | null };
  }
): FollowUp {
  return {
    id: f.id,
    clientId: f.clientId,
    type: f.type,
    date: f.date.toISOString().slice(0, 10),
    summary: f.summary,
    details: f.details ?? undefined,
    deadline: f.deadline?.toISOString().slice(0, 10),
    importance: f.importance as FollowUp["importance"],
    completedAt: f.completedAt?.toISOString(),
    createdById: f.createdById,
    createdByName: f.createdBy?.name ?? undefined,
    createdAt: f.createdAt.toISOString(),
  } as FollowUp;
}

export async function GET(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  try {
    const url = new URL(request.url);
    const query = parseClientQueryParams(url.searchParams);
    const where = buildClientWhere(query, session.user.id);

    const [clientRows, provinceFacetRows] = await Promise.all([
      db.client.findMany({
        where,
        include: { emailHistory: { orderBy: { date: "desc" } } },
      }),
      db.client.findMany({
        select: { province: true },
        distinct: ["province"],
        where: { province: { not: null } },
        orderBy: { province: "asc" },
      }),
    ]);

    const clientIds = clientRows.map((client) => client.id);
    const [policyRows, followUpRows] = clientIds.length
      ? await Promise.all([
          db.policy.findMany({
            where: { clientId: { in: clientIds } },
            include: { beneficiaries: true },
          }),
          db.followUp.findMany({
            where: { clientId: { in: clientIds } },
            include: { createdBy: { select: { name: true } } },
          }),
        ])
      : [[], []];

    const clients = clientRows.map(mapClientRow);
    const policies = policyRows.map(mapPolicyRow);
    const followUps = followUpRows.map(mapFollowUpRow);
    const result = queryClients(query, { clients, policies, followUps });
    result.facets = {
      provinces: provinceFacetRows
        .map((row) => row.province)
        .filter((province): province is string => !!province),
      tags: [...TAG_VALUES],
    };

    await auditLog({ action: "list_clients", entityType: "client" });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[clients] list failed:", error);
    return NextResponse.json(
      { ok: false, error: "Could not load clients" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const payload = await request.json().catch(() => null);
  const parsed = clientFormSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const companyName = data.companyName?.trim() || "";
  const firstNameInput = data.firstName?.trim() || companyName;
  const lastNameInput = data.lastName?.trim() || "";
  const firstName = firstNameInput === companyName ? companyName : toTitleCaseName(firstNameInput);
  const lastName = lastNameInput ? toTitleCaseName(lastNameInput) : "";
  const emailLower = data.email.toLowerCase();
  if (await db.client.findUnique({ where: { email: emailLower } })) {
    return NextResponse.json(
      {
        error: "Email already in use",
        issues: { fieldErrors: { email: ["Email already in use"] } },
      },
      { status: 409 },
    );
  }

  const createdRow = await db.client.create({
    data: {
      userId: session.user.id,
      firstName,
      lastName,
      companyName: companyName || null,
      email: emailLower,
      phone: data.phone || null,
      streetAddress: data.streetAddress || null,
      unit: data.unit || null,
      city: data.city || null,
      province: data.province || null,
      postalCode: data.postalCode || null,
      birthday: data.birthday ? new Date(data.birthday) : null,
      notes: normalizeClientNotes(data.notes) ?? null,
    },
  });

  const created: Client = {
    id: createdRow.id,
    firstName: createdRow.firstName,
    lastName: createdRow.lastName,
    companyName: createdRow.companyName ?? undefined,
    email: createdRow.email,
    phone: createdRow.phone ?? undefined,
    streetAddress: createdRow.streetAddress ?? undefined,
    unit: createdRow.unit ?? undefined,
    city: createdRow.city ?? undefined,
    province: createdRow.province as Client["province"],
    postalCode: createdRow.postalCode ?? undefined,
    birthday: createdRow.birthday?.toISOString().slice(0, 10),
    linkedToId: createdRow.linkedToId ?? undefined,
    relationship: createdRow.relationship as Client["relationship"],
    notes: createdRow.notes ?? undefined,
    manualTags: parseTagList(createdRow.manualTags),
    hiddenTags: parseTagList(createdRow.hiddenTags),
    createdAt: createdRow.createdAt.toISOString(),
  };

  await auditLog({
    action: "create_client",
    entityType: "client",
    entityId: created.id,
  });

  return NextResponse.json({ client: created }, { status: 201 });
}
