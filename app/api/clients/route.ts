import { NextResponse } from "next/server";

import { auditLog, requireSession, unauthorized } from "@/lib/api-security";
import { parseClientQueryParams, queryClients } from "@/lib/clients-query";
import { db } from "@/lib/db";
import { clientFormSchema } from "@/lib/validators";
import type { Client, FollowUp, Policy } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const query = parseClientQueryParams(url.searchParams);

  const [clientRows, policyRows, followUpRows] = await Promise.all([
    db.client.findMany({ include: { emailHistory: { orderBy: { date: "desc" } } } }),
    db.policy.findMany({ include: { beneficiaries: true } }),
    db.followUp.findMany(),
  ]);

  const clients: Client[] = clientRows.map((c) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone ?? undefined,
    streetAddress: c.streetAddress ?? undefined,
    unit: c.unit ?? undefined,
    city: c.city ?? undefined,
    province: c.province as Client["province"],
    postalCode: c.postalCode ?? undefined,
    birthday: c.birthday?.toISOString().slice(0, 10),
    notes: c.notes ?? undefined,
    linkedToId: c.linkedToId ?? undefined,
    relationship: c.relationship as Client["relationship"],
    emailHistory: c.emailHistory.map((entry) => ({
      id: entry.id,
      date: entry.date.toISOString(),
      subject: entry.subject,
      body: entry.body,
      templateLabel: entry.templateLabel ?? undefined,
    })),
    lastBirthdayEmailAt: c.lastBirthdayEmailAt?.toISOString(),
    lastContactedAt: c.lastContactedAt?.toISOString(),
    createdAt: c.createdAt.toISOString(),
  }));

  const policies = policyRows.map((p) => ({
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
    lastRenewalEmailAt: p.lastRenewalEmailAt?.toISOString(),
    beneficiaries: p.beneficiaries.map((b) => ({
      id: b.id,
      policyId: b.policyId,
      name: b.name,
      relationship: b.relationship,
      sharePercent: b.sharePercent,
    })),
  })) as Policy[];

  const followUps = followUpRows.map((f) => ({
    id: f.id,
    clientId: f.clientId,
    type: f.type,
    date: f.date.toISOString().slice(0, 10),
    summary: f.summary,
    details: f.details ?? undefined,
    createdById: f.createdById,
    createdAt: f.createdAt.toISOString(),
  })) as FollowUp[];

  const result = queryClients(query, { clients, policies, followUps });

  await auditLog({ action: "list_clients", entityType: "client" });
  return NextResponse.json(result);
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
      firstName: data.firstName,
      lastName: data.lastName,
      email: emailLower,
      phone: data.phone || null,
      streetAddress: data.streetAddress || null,
      unit: data.unit || null,
      city: data.city || null,
      province: data.province || null,
      postalCode: data.postalCode || null,
      birthday: data.birthday ? new Date(data.birthday) : null,
      notes: data.notes || null,
    },
  });

  const created: Client = {
    id: createdRow.id,
    firstName: createdRow.firstName,
    lastName: createdRow.lastName,
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
    createdAt: createdRow.createdAt.toISOString(),
  };

  await auditLog({
    action: "create_client",
    entityType: "client",
    entityId: created.id,
  });

  return NextResponse.json({ client: created }, { status: 201 });
}
