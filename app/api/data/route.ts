import { NextResponse } from "next/server";

import { auditLog, requireSession, unauthorized } from "@/lib/api-security";
import { db } from "@/lib/db";
import type {
  Beneficiary,
  Client,
  EmailHistoryEntry,
  FollowUp,
  Policy,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DataSnapshot = {
  clients: Client[];
  policies: Policy[];
  followUps: FollowUp[];
};

function dateOnly(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

function iso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function toDate(value: unknown): Date | undefined {
  if (!value || typeof value !== "string") return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function toNullDate(value: unknown): Date | null {
  return toDate(value) ?? null;
}

function stripUndefined<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as T;
}

function serializeClient(
  c: Awaited<ReturnType<typeof db.client.findMany>>[number] & {
    emailHistory?: Array<{
      id: string;
      date: Date;
      subject: string;
      body: string;
      templateLabel: string | null;
    }>;
  }
): Client {
  return {
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
    birthday: dateOnly(c.birthday),
    notes: c.notes ?? undefined,
    linkedToId: c.linkedToId ?? undefined,
    relationship: c.relationship as Client["relationship"],
    emailHistory: (c.emailHistory ?? []).map((entry) => ({
      id: entry.id,
      date: entry.date.toISOString(),
      subject: entry.subject,
      body: entry.body,
      templateLabel: entry.templateLabel ?? undefined,
    })),
    lastBirthdayEmailAt: iso(c.lastBirthdayEmailAt),
    lastContactedAt: iso(c.lastContactedAt),
    createdAt: c.createdAt.toISOString(),
  };
}

function serializePolicy(
  p: Awaited<ReturnType<typeof db.policy.findMany>>[number] & {
    beneficiaries?: Array<{
      id: string;
      policyId: string;
      name: string;
      relationship: string;
      sharePercent: number;
    }>;
  }
): Policy {
  return {
    id: p.id,
    clientId: p.clientId,
    carrier: p.carrier as Policy["carrier"],
    category: p.category as Policy["category"],
    productType: p.productType as Policy["productType"],
    productName: p.productName,
    policyNumber: p.policyNumber,
    sumAssured: p.sumAssured,
    premium: p.premium,
    paymentFrequency: p.paymentFrequency as Policy["paymentFrequency"],
    paymentTermYears: p.paymentTermYears ?? undefined,
    effectiveDate: dateOnly(p.effectiveDate) ?? "",
    premiumDate: p.premiumDate ?? undefined,
    maturityDate: dateOnly(p.maturityDate),
    status: p.status as Policy["status"],
    isCorporateInsurance: p.isCorporateInsurance,
    businessName: p.businessName ?? undefined,
    isInvestmentLoan: p.isInvestmentLoan,
    lender: p.lender as Policy["lender"],
    loanAmount: p.loanAmount ?? undefined,
    loanRate: p.loanRate ?? undefined,
    lastRenewalEmailAt: iso(p.lastRenewalEmailAt),
    beneficiaries: (p.beneficiaries ?? []).map((b) => ({
      id: b.id,
      policyId: b.policyId,
      name: b.name,
      relationship: b.relationship as Beneficiary["relationship"],
      sharePercent: b.sharePercent,
    })),
  };
}

function serializeFollowUp(
  f: Awaited<ReturnType<typeof db.followUp.findMany>>[number] & {
    createdBy?: { name: string };
  }
): FollowUp {
  return {
    id: f.id,
    clientId: f.clientId,
    type: f.type as FollowUp["type"],
    date: dateOnly(f.date) ?? f.date.toISOString(),
    summary: f.summary,
    details: f.details ?? undefined,
    createdById: f.createdById,
    createdByName: f.createdBy?.name,
    createdAt: f.createdAt.toISOString(),
  };
}

async function readData(): Promise<DataSnapshot> {
  const [clients, policies, followUps] = await Promise.all([
    db.client.findMany({
      include: { emailHistory: { orderBy: { date: "desc" } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    db.policy.findMany({
      include: { beneficiaries: true },
      orderBy: { createdAt: "desc" },
    }),
    db.followUp.findMany({
      include: { createdBy: { select: { name: true } } },
      orderBy: { date: "desc" },
    }),
  ]);

  return {
    clients: clients.map(serializeClient),
    policies: policies.map(serializePolicy),
    followUps: followUps.map(serializeFollowUp),
  };
}

function nullableString(value: string | undefined, partial: boolean) {
  if (value === undefined) return partial ? undefined : null;
  return value || null;
}

function clientData(input: Partial<Client>, partial = false) {
  return stripUndefined({
    id: input.id,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email?.toLowerCase(),
    phone: nullableString(input.phone, partial),
    streetAddress: nullableString(input.streetAddress, partial),
    unit: nullableString(input.unit, partial),
    city: nullableString(input.city, partial),
    province: input.province === undefined ? (partial ? undefined : null) : input.province || null,
    postalCode: nullableString(input.postalCode, partial),
    birthday: input.birthday === undefined ? (partial ? undefined : null) : input.birthday ? toNullDate(input.birthday) : null,
    notes: nullableString(input.notes, partial),
    linkedToId: nullableString(input.linkedToId, partial),
    relationship: input.relationship === undefined ? (partial ? undefined : null) : input.relationship || null,
    lastBirthdayEmailAt: input.lastBirthdayEmailAt ? toNullDate(input.lastBirthdayEmailAt) : undefined,
    lastContactedAt: input.lastContactedAt ? toNullDate(input.lastContactedAt) : undefined,
    createdAt: input.createdAt ? toDate(input.createdAt) : undefined,
  });
}

function policyData(input: Partial<Policy>, partial = false) {
  return stripUndefined({
    id: input.id,
    clientId: input.clientId,
    carrier: input.carrier,
    category: input.category,
    productType: input.productType,
    productName:
      input.productName === undefined
        ? partial
          ? undefined
          : input.productType || ""
        : input.productName || input.productType || "",
    policyNumber: input.policyNumber,
    sumAssured: input.sumAssured === undefined ? (partial ? undefined : 0) : Number(input.sumAssured),
    premium: input.premium === undefined ? (partial ? undefined : 0) : Number(input.premium),
    paymentFrequency: input.paymentFrequency === undefined ? (partial ? undefined : "Annual") : input.paymentFrequency,
    paymentTermYears: input.paymentTermYears === undefined ? (partial ? undefined : null) : input.paymentTermYears,
    effectiveDate: input.effectiveDate === undefined ? (partial ? undefined : new Date()) : toDate(input.effectiveDate),
    premiumDate: nullableString(input.premiumDate, partial),
    maturityDate: input.maturityDate === undefined ? (partial ? undefined : null) : input.maturityDate ? toNullDate(input.maturityDate) : null,
    status: input.status === undefined ? (partial ? undefined : "active") : input.status || "active",
    isCorporateInsurance: input.isCorporateInsurance === undefined ? (partial ? undefined : false) : !!input.isCorporateInsurance,
    businessName: nullableString(input.businessName, partial),
    isInvestmentLoan: input.isInvestmentLoan === undefined ? (partial ? undefined : false) : !!input.isInvestmentLoan,
    lender: input.lender === undefined ? (partial ? undefined : null) : input.lender || null,
    loanAmount: input.loanAmount === undefined ? (partial ? undefined : null) : input.loanAmount,
    loanRate: input.loanRate === undefined ? (partial ? undefined : null) : input.loanRate,
    lastRenewalEmailAt: input.lastRenewalEmailAt ? toNullDate(input.lastRenewalEmailAt) : undefined,
  });
}

async function replaceAll(snapshot: {
  clients?: Client[];
  policies?: Policy[];
  followUps?: FollowUp[];
}, userId: string) {
  const clients = Array.isArray(snapshot.clients) ? snapshot.clients : [];
  const policies = Array.isArray(snapshot.policies) ? snapshot.policies : [];
  const followUps = Array.isArray(snapshot.followUps) ? snapshot.followUps : [];
  const clientIds = new Set(clients.map((c) => c.id));

  await db.$transaction(async (tx) => {
    await tx.beneficiary.deleteMany();
    await tx.emailHistory.deleteMany();
    await tx.followUp.deleteMany();
    await tx.policy.deleteMany();
    await tx.client.deleteMany();

    for (const c of clients) {
      await tx.client.create({
        data: clientData({
          ...c,
          linkedToId: undefined,
        }) as never,
      });
      for (const entry of c.emailHistory ?? []) {
        await tx.emailHistory.create({
          data: {
            id: entry.id,
            clientId: c.id,
            userId,
            date: toDate(entry.date) ?? new Date(),
            subject: entry.subject,
            body: entry.body,
            templateLabel: entry.templateLabel ?? null,
          },
        });
      }
    }

    for (const c of clients) {
      if (c.linkedToId && clientIds.has(c.linkedToId)) {
        await tx.client.update({
          where: { id: c.id },
          data: {
            linkedToId: c.linkedToId,
            relationship: c.relationship ?? null,
          },
        });
      }
    }

    for (const p of policies.filter((p) => clientIds.has(p.clientId))) {
      const data = policyData(p);
      await tx.policy.create({
        data: {
          ...data,
          beneficiaries: {
            create: (p.beneficiaries ?? []).map((b) => ({
              id: b.id,
              name: b.name,
              relationship: b.relationship,
              sharePercent: b.sharePercent,
            })),
          },
        } as never,
      });
    }

    for (const f of followUps.filter((f) => clientIds.has(f.clientId))) {
      await tx.followUp.create({
        data: {
          id: f.id,
          clientId: f.clientId,
          createdById: userId,
          type: f.type,
          date: toDate(f.date) ?? new Date(),
          summary: f.summary,
          details: f.details ?? null,
          createdAt: toDate(f.createdAt) ?? new Date(),
        },
      });
    }
  });
}

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();

  const data = await readData();
  await auditLog({ action: "read_data", entityType: "crm_data" });
  return NextResponse.json({ ok: true, ...data });
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const body = (await request.json().catch(() => null)) as {
    action?: string;
    payload?: Record<string, unknown>;
  } | null;
  if (!body?.action) {
    return NextResponse.json({ ok: false, error: "Missing action" }, { status: 400 });
  }

  try {
    const payload = body.payload ?? {};
    switch (body.action) {
      case "client.create": {
        const client = payload.client as Client;
        await db.client.create({ data: clientData(client) as never });
        await auditLog({ action: "create_client", entityType: "client", entityId: client.id });
        break;
      }
      case "client.update": {
        await db.client.update({
          where: { id: String(payload.id) },
          data: clientData(payload.patch as Partial<Client>, true) as never,
        });
        await auditLog({ action: "update_client", entityType: "client", entityId: String(payload.id) });
        break;
      }
      case "client.delete": {
        await db.client.delete({ where: { id: String(payload.id) } });
        await auditLog({ action: "delete_client", entityType: "client", entityId: String(payload.id) });
        break;
      }
      case "policy.create": {
        const policy = payload.policy as Policy;
        const data = policyData(policy);
        await db.policy.create({
          data: {
            ...data,
            beneficiaries: {
              create: (policy.beneficiaries ?? []).map((b) => ({
                id: b.id,
                name: b.name,
                relationship: b.relationship,
                sharePercent: b.sharePercent,
              })),
            },
          } as never,
        });
        await auditLog({ action: "create_policy", entityType: "policy", entityId: policy.id });
        break;
      }
      case "policy.update": {
        const id = String(payload.id);
        const patch = payload.patch as Partial<Policy> & { beneficiaries?: Beneficiary[] };
        await db.policy.update({ where: { id }, data: policyData(patch, true) as never });
        if (Array.isArray(patch.beneficiaries)) {
          await db.beneficiary.deleteMany({ where: { policyId: id } });
          await db.beneficiary.createMany({
            data: patch.beneficiaries.map((b) => ({
              id: b.id,
              policyId: id,
              name: b.name,
              relationship: b.relationship,
              sharePercent: b.sharePercent,
            })),
          });
        }
        await auditLog({ action: "update_policy", entityType: "policy", entityId: id });
        break;
      }
      case "policy.delete": {
        await db.policy.delete({ where: { id: String(payload.id) } });
        await auditLog({ action: "delete_policy", entityType: "policy", entityId: String(payload.id) });
        break;
      }
      case "followup.create": {
        const f = payload.followUp as FollowUp;
        await db.followUp.create({
          data: {
            id: f.id,
            clientId: f.clientId,
            createdById: session.user.id,
            type: f.type,
            date: toDate(f.date) ?? new Date(),
            summary: f.summary,
            details: f.details ?? null,
            createdAt: toDate(f.createdAt) ?? new Date(),
          },
        });
        await auditLog({ action: "create_followup", entityType: "followup", entityId: f.id });
        break;
      }
      case "followup.delete": {
        await db.followUp.delete({ where: { id: String(payload.id) } });
        await auditLog({ action: "delete_followup", entityType: "followup", entityId: String(payload.id) });
        break;
      }
      case "emailHistory.append": {
        const entry = payload.entry as EmailHistoryEntry;
        const clientId = String(payload.clientId);
        await db.emailHistory.create({
          data: {
            id: entry.id,
            clientId,
            userId: session.user.id,
            date: toDate(entry.date) ?? new Date(),
            subject: entry.subject,
            body: entry.body,
            templateLabel: entry.templateLabel ?? null,
          },
        });
        await db.client.update({
          where: { id: clientId },
          data: { lastContactedAt: toDate(entry.date) ?? new Date() },
        });
        await auditLog({ action: "send_email", entityType: "client", entityId: clientId });
        break;
      }
      case "policy.markRenewalEmailSent": {
        await db.policy.update({
          where: { id: String(payload.policyId) },
          data: { lastRenewalEmailAt: toDate(payload.at) ?? new Date() },
        });
        await auditLog({ action: "mark_renewal_email_sent", entityType: "policy", entityId: String(payload.policyId) });
        break;
      }
      case "client.markBirthdayEmailSent": {
        await db.client.update({
          where: { id: String(payload.clientId) },
          data: { lastBirthdayEmailAt: toDate(payload.at) ?? new Date() },
        });
        await auditLog({ action: "mark_birthday_email_sent", entityType: "client", entityId: String(payload.clientId) });
        break;
      }
      case "client.prependNote": {
        const id = String(payload.clientId);
        const block = String(payload.block ?? "");
        const client = await db.client.findUnique({ where: { id }, select: { notes: true } });
        const existing = (client?.notes ?? "").trim();
        await db.client.update({
          where: { id },
          data: { notes: existing ? `${block}\n---\n${existing}` : block },
        });
        await auditLog({ action: "append_client_note", entityType: "client", entityId: id });
        break;
      }
      case "data.replaceAll": {
        await replaceAll(payload.snapshot as never, session.user.id);
        await auditLog({ action: "replace_all_data", entityType: "crm_data" });
        break;
      }
      default:
        return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Data action failed" },
      { status: 400 },
    );
  }
}
