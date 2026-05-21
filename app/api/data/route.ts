import { NextResponse } from "next/server";
import { z } from "zod";

import { auditLog, requireSession, unauthorized } from "@/lib/api-security";
import { buildClientSlug, ensureUniqueClientSlugs } from "@/lib/client-slug";
import { parseTagList } from "@/lib/client-tags";
import { isTagValue, type TagValue } from "@/lib/constants";
import { normalizeClientNotes, removeCommunicationNoteBlocks } from "@/lib/communication-notes";
import { db } from "@/lib/db";
import {
  parseInsuredPersonsJson,
  serializeInsuredPersonsJson,
} from "@/lib/policy-parties";
import { toTitleCaseName } from "@/lib/text-utils";
import type {
  Beneficiary,
  Client,
  ClientRelationship,
  EmailHistoryAttachment,
  EmailHistoryEntry,
  EmailReminderSend,
  FollowUp,
  Policy,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DataSnapshot = {
  clients: Client[];
  policies: Policy[];
  followUps: FollowUp[];
  relationships: ClientRelationship[];
  emailReminderSends: EmailReminderSend[];
};

const idSchema = z.string().min(1);
const objectPayloadSchema = z.object({}).passthrough();
const dataActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("client.create"), payload: z.object({ client: objectPayloadSchema.extend({ id: idSchema }) }) }),
  z.object({ action: z.literal("client.update"), payload: z.object({ id: idSchema, patch: objectPayloadSchema }) }),
  z.object({ action: z.literal("client.delete"), payload: z.object({ id: idSchema }) }),
  z.object({ action: z.literal("clientRelationships.replace"), payload: z.object({ clientId: idSchema, relationships: z.array(objectPayloadSchema).default([]) }) }),
  z.object({ action: z.literal("policy.create"), payload: z.object({ policy: objectPayloadSchema.extend({ id: idSchema }) }) }),
  z.object({ action: z.literal("policy.update"), payload: z.object({ id: idSchema, patch: objectPayloadSchema }) }),
  z.object({ action: z.literal("policy.delete"), payload: z.object({ id: idSchema }) }),
  z.object({ action: z.literal("followup.create"), payload: z.object({ followUp: objectPayloadSchema.extend({ id: idSchema }) }) }),
  z.object({ action: z.literal("followup.delete"), payload: z.object({ id: idSchema }) }),
  z.object({ action: z.literal("emailHistory.append"), payload: z.object({ clientId: idSchema, entry: objectPayloadSchema.extend({ id: idSchema }) }) }),
  z.object({ action: z.literal("emailHistory.update"), payload: z.object({ clientId: idSchema, entryId: idSchema, patch: objectPayloadSchema }) }),
  z.object({ action: z.literal("emailHistory.delete"), payload: z.object({ clientId: idSchema, entryIds: z.array(idSchema).min(1) }) }),
  z.object({ action: z.literal("emailReminderSend.record"), payload: z.object({ reminderSend: objectPayloadSchema.extend({ dedupeKey: idSchema, clientId: idSchema, type: z.enum(["premium", "birthday"]), cycleKey: idSchema }) }) }),
  z.object({ action: z.literal("policy.markRenewalEmailSent"), payload: z.object({ policyId: idSchema, at: z.string().optional() }) }),
  z.object({ action: z.literal("client.markBirthdayEmailSent"), payload: z.object({ clientId: idSchema, at: z.string().optional() }) }),
  z.object({ action: z.literal("client.prependNote"), payload: z.object({ clientId: idSchema, block: z.string() }) }),
  z.object({ action: z.literal("data.replaceAll"), payload: z.object({ snapshot: objectPayloadSchema }) }),
]);

async function requireOwnedClient(clientId: string, userId: string) {
  const client = await db.client.findFirst({ where: { id: clientId, userId }, select: { id: true } });
  if (!client) throw new Error("Client not found");
  return client;
}

async function requireOwnedPolicy(policyId: string, userId: string) {
  const policy = await db.policy.findFirst({ where: { id: policyId, userId }, select: { id: true, clientId: true } });
  if (!policy) throw new Error("Policy not found");
  return policy;
}

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

function normalizeEmailAttachments(value: unknown): EmailHistoryAttachment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const attachments = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const filename = typeof record.filename === "string" ? record.filename.trim() : "";
      if (!filename) return null;
      return {
        filename: filename.slice(0, 240),
        contentType:
          typeof record.contentType === "string" && record.contentType.trim()
            ? record.contentType.trim().slice(0, 120)
            : undefined,
        size:
          typeof record.size === "number" && Number.isFinite(record.size)
            ? Math.max(0, Math.floor(record.size))
            : undefined,
      };
    })
    .filter(Boolean) as EmailHistoryAttachment[];
  return attachments.length > 0 ? attachments : undefined;
}

function parseEmailAttachments(value: string | null | undefined): EmailHistoryAttachment[] | undefined {
  if (!value) return undefined;
  try {
    return normalizeEmailAttachments(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function serializeEmailAttachments(value: unknown): string | null {
  const attachments = normalizeEmailAttachments(value);
  return attachments ? JSON.stringify(attachments) : null;
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

function serializeTagList(value: TagValue[] | undefined, partial: boolean) {
  if (value === undefined) return partial ? undefined : null;
  const tags = value.filter(isTagValue);
  return tags.length > 0 ? JSON.stringify(tags) : null;
}

function serializeClient(
  c: Awaited<ReturnType<typeof db.client.findMany>>[number] & {
    emailHistory?: Array<{
      id: string;
      date: Date;
      subject: string;
      body: string;
      templateLabel: string | null;
      policyId: string | null;
      policyNumber: string | null;
      policyLabel: string | null;
      communicationType: string | null;
      attachments: string | null;
    }>;
  }
): Client {
  return {
    id: c.id,
    slug: c.slug ?? buildClientSlug(c),
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
    birthday: dateOnly(c.birthday),
    notes: c.notes ?? undefined,
    manualTags: parseTagList(c.manualTags),
    hiddenTags: parseTagList(c.hiddenTags),
    linkedToId: c.linkedToId ?? undefined,
    relationship: c.relationship as Client["relationship"],
    emailHistory: (c.emailHistory ?? []).map((entry) => ({
      id: entry.id,
      date: entry.date.toISOString(),
      subject: entry.subject,
      body: entry.body,
      templateLabel: entry.templateLabel ?? undefined,
      policyId: entry.policyId ?? undefined,
      policyNumber: entry.policyNumber ?? undefined,
      policyLabel: entry.policyLabel ?? undefined,
      communicationType: entry.communicationType ?? undefined,
      attachments: parseEmailAttachments(entry.attachments),
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
    isJoint: p.isJoint,
    jointWithClientId: p.jointWithClientId ?? undefined,
    policyOwnerName: p.policyOwnerName ?? undefined,
    policyOwnerClientId: p.policyOwnerClientId ?? undefined,
    policyOwner2Name: p.policyOwner2Name ?? undefined,
    policyOwner2ClientId: p.policyOwner2ClientId ?? undefined,
    insuredPersons: parseInsuredPersonsJson(p.insuredPersons),
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
    deadline: dateOnly(f.deadline) ?? undefined,
    importance: f.importance as FollowUp["importance"],
    createdById: f.createdById,
    createdByName: f.createdBy?.name,
    createdAt: f.createdAt.toISOString(),
  };
}

function serializeRelationship(
  relationship: {
    id: string;
    fromClientId: string;
    toClientId: string;
    relationship: string;
    createdAt: Date;
  }
): ClientRelationship {
  return {
    id: relationship.id,
    fromClientId: relationship.fromClientId,
    toClientId: relationship.toClientId,
    relationship: relationship.relationship as ClientRelationship["relationship"],
    createdAt: relationship.createdAt.toISOString(),
  };
}

function serializeEmailReminderSend(send: {
  id: string;
  dedupeKey: string;
  policyId: string | null;
  clientId: string;
  type: string;
  stage: string | null;
  cycleKey: string;
  source: string;
  messageId: string | null;
  sentAt: Date;
  createdAt: Date;
}): EmailReminderSend {
  return {
    id: send.id,
    dedupeKey: send.dedupeKey,
    policyId: send.policyId ?? undefined,
    clientId: send.clientId,
    type: send.type as EmailReminderSend["type"],
    stage: send.stage as EmailReminderSend["stage"],
    cycleKey: send.cycleKey,
    source: send.source as EmailReminderSend["source"],
    messageId: send.messageId ?? undefined,
    sentAt: send.sentAt.toISOString(),
    createdAt: send.createdAt.toISOString(),
  };
}

async function readData(userId: string): Promise<DataSnapshot> {
  const [clients, policies, followUps, relationships, emailReminderSends] = await Promise.all([
    db.client.findMany({
      where: { userId },
      include: { emailHistory: { orderBy: { date: "desc" } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    db.policy.findMany({
      where: { userId },
      include: { beneficiaries: true },
      orderBy: { createdAt: "desc" },
    }),
    db.followUp.findMany({
      where: { client: { userId } },
      include: { createdBy: { select: { name: true } } },
      orderBy: { date: "desc" },
    }),
    db.clientRelationship.findMany({
      where: { fromClient: { userId }, toClient: { userId } },
      orderBy: { createdAt: "asc" },
    }),
    db.emailReminderSend.findMany({
      where: { client: { userId } },
      orderBy: { sentAt: "desc" },
    }),
  ]);

  return {
    clients: clients.map(serializeClient),
    policies: policies.map(serializePolicy),
    followUps: followUps.map(serializeFollowUp),
    relationships: relationships.map(serializeRelationship),
    emailReminderSends: emailReminderSends.map(serializeEmailReminderSend),
  };
}

function nullableString(value: string | undefined, partial: boolean) {
  if (value === undefined) return partial ? undefined : null;
  return value || null;
}

function clientData(input: Partial<Client>, partial = false, userId?: string) {
  const firstName =
    input.firstName === undefined ? undefined : toTitleCaseName(input.firstName);
  const lastName =
    input.lastName === undefined ? undefined : toTitleCaseName(input.lastName);
  const generatedSlug =
    input.slug ??
    (input.id && firstName && lastName
      ? buildClientSlug({
          id: input.id,
          firstName,
          lastName,
        })
      : undefined);
  return stripUndefined({
    id: input.id,
    userId,
    slug: generatedSlug,
    firstName,
    lastName,
    companyName: nullableString(input.companyName, partial),
    email: input.email?.toLowerCase(),
    phone: nullableString(input.phone, partial),
    streetAddress: nullableString(input.streetAddress, partial),
    unit: nullableString(input.unit, partial),
    city: nullableString(input.city, partial),
    province: input.province === undefined ? (partial ? undefined : null) : input.province || null,
    postalCode: nullableString(input.postalCode, partial),
    birthday: input.birthday === undefined ? (partial ? undefined : null) : input.birthday ? toNullDate(input.birthday) : null,
    notes: input.notes === undefined ? (partial ? undefined : null) : normalizeClientNotes(input.notes) ?? null,
    manualTags: serializeTagList(input.manualTags, partial),
    hiddenTags: serializeTagList(input.hiddenTags, partial),
    linkedToId: nullableString(input.linkedToId, partial),
    relationship: input.relationship === undefined ? (partial ? undefined : null) : input.relationship || null,
    lastBirthdayEmailAt: input.lastBirthdayEmailAt ? toNullDate(input.lastBirthdayEmailAt) : undefined,
    lastContactedAt: input.lastContactedAt ? toNullDate(input.lastContactedAt) : undefined,
    createdAt: input.createdAt ? toDate(input.createdAt) : undefined,
  });
}

function policyData(input: Partial<Policy>, partial = false, userId?: string) {
  return stripUndefined({
    id: input.id,
    userId,
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
    isJoint: input.isJoint === undefined ? (partial ? undefined : false) : !!input.isJoint,
    jointWithClientId:
      input.isJoint === false
        ? null
        : input.jointWithClientId === undefined
          ? partial
            ? undefined
            : null
          : input.jointWithClientId || null,
    policyOwnerName: nullableString(input.policyOwnerName, partial),
    policyOwnerClientId: nullableString(input.policyOwnerClientId, partial),
    policyOwner2Name: nullableString(input.policyOwner2Name, partial),
    policyOwner2ClientId: nullableString(input.policyOwner2ClientId, partial),
    insuredPersons: serializeInsuredPersonsJson(input.insuredPersons, partial),
    lastRenewalEmailAt: input.lastRenewalEmailAt ? toNullDate(input.lastRenewalEmailAt) : undefined,
  });
}

async function replaceAll(snapshot: {
  clients?: Client[];
  policies?: Policy[];
  followUps?: FollowUp[];
  relationships?: ClientRelationship[];
  emailReminderSends?: EmailReminderSend[];
}, userId: string) {
  const clients = ensureUniqueClientSlugs(
    Array.isArray(snapshot.clients) ? snapshot.clients : []
  );
  const policies = Array.isArray(snapshot.policies) ? snapshot.policies : [];
  const followUps = Array.isArray(snapshot.followUps) ? snapshot.followUps : [];
  const relationships = Array.isArray(snapshot.relationships) ? snapshot.relationships : [];
  const emailReminderSends = Array.isArray(snapshot.emailReminderSends) ? snapshot.emailReminderSends : [];
  const clientIds = new Set(clients.map((c) => c.id));

  // Build all rows up-front so the transaction body itself only issues
  // a fixed number of bulk SQL statements. Restoring an account with
  // hundreds of clients used to issue 2k+ individual INSERTs inside a
  // single 30-second transaction; this version is bounded by table
  // count, not row count.
  const clientRows = clients.map((c) => clientData({ ...c, linkedToId: undefined }, false, userId));

  const emailHistoryRows = clients.flatMap((c) =>
    (c.emailHistory ?? []).map((entry) => ({
      id: entry.id,
      clientId: c.id,
      userId,
      date: toDate(entry.date) ?? new Date(),
      subject: entry.subject,
      body: entry.body,
      templateLabel: entry.templateLabel ?? null,
      policyId: entry.policyId ?? null,
      policyNumber: entry.policyNumber ?? null,
      policyLabel: entry.policyLabel ?? null,
      communicationType: entry.communicationType ?? null,
      attachments: serializeEmailAttachments(entry.attachments),
    }))
  );

  const linkedClientUpdates = clients
    .filter((c) => c.linkedToId && clientIds.has(c.linkedToId))
    .map((c) => ({
      where: { id: c.id },
      data: {
        linkedToId: c.linkedToId!,
        relationship: c.relationship ?? null,
      },
    }));

  const seenRelationships = new Set<string>();
  const relationshipRows: Array<{
    id: string;
    fromClientId: string;
    toClientId: string;
    relationship: string;
    createdAt: Date;
  }> = [];
  for (const relationship of [
    ...relationships,
    ...clients
      .filter((c) => c.linkedToId && c.relationship)
      .map((c) => ({
        id: `${c.id}_${c.linkedToId}`,
        fromClientId: c.id,
        toClientId: c.linkedToId!,
        relationship: c.relationship!,
        createdAt: c.createdAt,
      } satisfies ClientRelationship)),
  ]) {
    if (
      !clientIds.has(relationship.fromClientId) ||
      !clientIds.has(relationship.toClientId) ||
      relationship.fromClientId === relationship.toClientId
    ) {
      continue;
    }
    const key = `${relationship.fromClientId}:${relationship.toClientId}`;
    if (seenRelationships.has(key)) continue;
    seenRelationships.add(key);
    relationshipRows.push({
      id: relationship.id,
      fromClientId: relationship.fromClientId,
      toClientId: relationship.toClientId,
      relationship: relationship.relationship,
      createdAt: toDate(relationship.createdAt) ?? new Date(),
    });
  }

  // Policies still need per-row create() because beneficiaries are a
  // nested write that createMany does not support. We pre-compute the
  // policy data so the inner loop is just one tx call per policy.
  const policyEntries = policies
    .filter((p) => clientIds.has(p.clientId))
    .map((p) => {
      const hasValidJoint =
        !!p.isJoint &&
        !!p.jointWithClientId &&
        clientIds.has(p.jointWithClientId) &&
        p.jointWithClientId !== p.clientId;
      const data = policyData({
        ...p,
        isJoint: hasValidJoint,
        jointWithClientId: hasValidJoint ? p.jointWithClientId : undefined,
      }, false, userId);
      const beneficiaries = (p.beneficiaries ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        relationship: b.relationship,
        sharePercent: b.sharePercent,
      }));
      return { data, beneficiaries };
    });

  const policyIdSet = new Set(policyEntries.map((entry) => entry.data.id as string).filter(Boolean));

  const reminderRows = emailReminderSends
    .filter((send) => clientIds.has(send.clientId))
    .filter((send) => !send.policyId || policyIdSet.has(send.policyId))
    .map((send) => ({
      id: send.id,
      dedupeKey: send.dedupeKey,
      policyId: send.policyId ?? null,
      clientId: send.clientId,
      type: send.type,
      stage: send.stage ?? null,
      cycleKey: send.cycleKey,
      source: send.source ?? "manual",
      messageId: send.messageId ?? null,
      sentAt: toDate(send.sentAt) ?? new Date(),
      createdAt: toDate(send.createdAt) ?? new Date(),
    }));

  const followUpRows = followUps
    .filter((f) => clientIds.has(f.clientId))
    .map((f) => ({
      id: f.id,
      clientId: f.clientId,
      createdById: userId,
      type: f.type,
      date: toDate(f.date) ?? new Date(),
      summary: f.summary,
      details: f.details ?? null,
      deadline: toNullDate(f.deadline),
      importance: f.importance ?? null,
      createdAt: toDate(f.createdAt) ?? new Date(),
    }));

  await db.$transaction(async (tx) => {
    await tx.client.deleteMany({ where: { userId } });

    if (clientRows.length) {
      await tx.client.createMany({ data: clientRows as never });
    }

    if (emailHistoryRows.length) {
      await tx.emailHistory.createMany({ data: emailHistoryRows });
    }

    // linkedToId is a self-reference; rows must already exist before we
    // can resolve the FK. Updates run after the bulk client insert.
    for (const update of linkedClientUpdates) {
      await tx.client.update(update);
    }

    if (relationshipRows.length) {
      await tx.clientRelationship.createMany({ data: relationshipRows });
    }

    // Beneficiaries are nested under each policy, so this loop stays
    // per-policy. The cost is O(policy count), not O(client * policy).
    for (const entry of policyEntries) {
      await tx.policy.create({
        data: {
          ...entry.data,
          beneficiaries: {
            create: entry.beneficiaries,
          },
        } as never,
      });
    }

    if (reminderRows.length) {
      await tx.emailReminderSend.createMany({ data: reminderRows });
    }

    if (followUpRows.length) {
      await tx.followUp.createMany({ data: followUpRows });
    }
  }, { maxWait: 10_000, timeout: 120_000 });
}

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();

  const data = await readData(session.user.id);
  await auditLog({ action: "read_data", entityType: "crm_data" });
  return NextResponse.json({ ok: true, ...data });
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const rawBody = await request.json().catch(() => null);
  const parsedBody = dataActionSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid data action payload", issues: parsedBody.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const body = parsedBody.data as { action: string; payload: Record<string, unknown> };
    const payload = body.payload;
    switch (body.action) {
      case "client.create": {
        const client = payload.client as Client;
        await db.client.create({ data: clientData(client, false, session.user.id) as never });
        await auditLog({ action: "create_client", entityType: "client", entityId: client.id });
        break;
      }
      case "client.update": {
        const patch = payload.patch as Partial<Client>;
        await requireOwnedClient(String(payload.id), session.user.id);
        if (patch.linkedToId) await requireOwnedClient(patch.linkedToId, session.user.id);
        await db.client.update({
          where: { id: String(payload.id) },
          data: clientData(patch, true) as never,
        });
        await auditLog({ action: "update_client", entityType: "client", entityId: String(payload.id) });
        break;
      }
      case "client.delete": {
        await requireOwnedClient(String(payload.id), session.user.id);
        await db.client.delete({ where: { id: String(payload.id) } });
        await auditLog({ action: "delete_client", entityType: "client", entityId: String(payload.id) });
        break;
      }
      case "clientRelationships.replace": {
        const clientId = String(payload.clientId);
        await requireOwnedClient(clientId, session.user.id);
        const rows = Array.isArray(payload.relationships)
          ? (payload.relationships as ClientRelationship[])
          : [];
        const liveClients = await db.client.findMany({
          where: { userId: session.user.id },
          select: { id: true },
        });
        const liveClientIds = new Set(liveClients.map((client) => client.id));
        await db.$transaction(async (tx) => {
          await tx.clientRelationship.deleteMany({
            where: {
              OR: [{ fromClientId: clientId }, { toClientId: clientId }],
            },
          });
          const seen = new Set<string>();
          for (const relationship of rows) {
            if (
              relationship.fromClientId !== clientId ||
              !liveClientIds.has(relationship.toClientId) ||
              relationship.toClientId === clientId
            ) {
              continue;
            }
            const key = `${relationship.fromClientId}:${relationship.toClientId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            await tx.clientRelationship.create({
              data: {
                id: relationship.id,
                fromClientId: relationship.fromClientId,
                toClientId: relationship.toClientId,
                relationship: relationship.relationship,
                createdAt: toDate(relationship.createdAt) ?? new Date(),
              },
            });
          }
        });
        await auditLog({
          action: "replace_client_relationships",
          entityType: "client",
          entityId: clientId,
          metadata: { count: rows.length },
        });
        break;
      }
      case "policy.create": {
        const policy = payload.policy as Policy;
        await requireOwnedClient(policy.clientId, session.user.id);
        if (policy.jointWithClientId) await requireOwnedClient(policy.jointWithClientId, session.user.id);
        if (policy.policyOwnerClientId) await requireOwnedClient(policy.policyOwnerClientId, session.user.id);
        if (policy.policyOwner2ClientId) await requireOwnedClient(policy.policyOwner2ClientId, session.user.id);
        const data = policyData(policy, false, session.user.id);
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
        await requireOwnedPolicy(id, session.user.id);
        const patch = payload.patch as Partial<Policy> & { beneficiaries?: Beneficiary[] };
        if (patch.clientId) await requireOwnedClient(patch.clientId, session.user.id);
        if (patch.jointWithClientId) await requireOwnedClient(patch.jointWithClientId, session.user.id);
        if (patch.policyOwnerClientId) await requireOwnedClient(patch.policyOwnerClientId, session.user.id);
        if (patch.policyOwner2ClientId) await requireOwnedClient(patch.policyOwner2ClientId, session.user.id);
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
        await requireOwnedPolicy(String(payload.id), session.user.id);
        await db.policy.delete({ where: { id: String(payload.id) } });
        await auditLog({ action: "delete_policy", entityType: "policy", entityId: String(payload.id) });
        break;
      }
      case "followup.create": {
        const f = payload.followUp as FollowUp;
        await requireOwnedClient(f.clientId, session.user.id);
        await db.followUp.create({
          data: {
            id: f.id,
            clientId: f.clientId,
            createdById: session.user.id,
            type: f.type,
            date: toDate(f.date) ?? new Date(),
            summary: f.summary,
            details: f.details ?? null,
            deadline: toNullDate(f.deadline),
            importance: f.importance ?? null,
            createdAt: toDate(f.createdAt) ?? new Date(),
          },
        });
        await auditLog({ action: "create_followup", entityType: "followup", entityId: f.id });
        break;
      }
      case "followup.delete": {
        const followUp = await db.followUp.findFirst({
          where: { id: String(payload.id), client: { userId: session.user.id } },
          select: { id: true },
        });
        if (!followUp) throw new Error("Follow-up not found");
        await db.followUp.delete({ where: { id: String(payload.id) } });
        await auditLog({ action: "delete_followup", entityType: "followup", entityId: String(payload.id) });
        break;
      }
      case "emailHistory.append": {
        const entry = payload.entry as EmailHistoryEntry;
        const clientId = String(payload.clientId);
        await requireOwnedClient(clientId, session.user.id);
        if (entry.policyId) await requireOwnedPolicy(entry.policyId, session.user.id);
        await db.emailHistory.create({
          data: {
            id: entry.id,
            clientId,
            userId: session.user.id,
            date: toDate(entry.date) ?? new Date(),
            subject: entry.subject,
            body: entry.body,
            templateLabel: entry.templateLabel ?? null,
            policyId: entry.policyId ?? null,
            policyNumber: entry.policyNumber ?? null,
            policyLabel: entry.policyLabel ?? null,
            communicationType: entry.communicationType ?? null,
            attachments: serializeEmailAttachments(entry.attachments),
          },
        });
        await db.client.update({
          where: { id: clientId },
          data: { lastContactedAt: toDate(entry.date) ?? new Date() },
        });
        await auditLog({ action: "send_email", entityType: "client", entityId: clientId });
        break;
      }
      case "emailHistory.update": {
        const clientId = String(payload.clientId);
        await requireOwnedClient(clientId, session.user.id);
        const entryId = String(payload.entryId);
        const patch = payload.patch as Partial<EmailHistoryEntry> & {
          policyId?: string | null;
          policyNumber?: string | null;
          policyLabel?: string | null;
          attachments?: EmailHistoryAttachment[] | null;
        };
        const data: {
          subject?: string;
          body?: string;
          templateLabel?: string | null;
          policyId?: string | null;
          policyNumber?: string | null;
          policyLabel?: string | null;
          communicationType?: string | null;
          attachments?: string | null;
        } = {};
        if (typeof patch.subject === "string") data.subject = patch.subject;
        if (typeof patch.body === "string") data.body = patch.body;
        if (Object.prototype.hasOwnProperty.call(patch, "templateLabel")) {
          data.templateLabel = patch.templateLabel ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(patch, "communicationType")) {
          data.communicationType = patch.communicationType ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(patch, "policyId")) {
          if (patch.policyId) await requireOwnedPolicy(patch.policyId, session.user.id);
          data.policyId = patch.policyId ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(patch, "policyNumber")) {
          data.policyNumber = patch.policyNumber ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(patch, "policyLabel")) {
          data.policyLabel = patch.policyLabel ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(patch, "attachments")) {
          data.attachments = serializeEmailAttachments(patch.attachments);
        }
        if (Object.keys(data).length === 0) {
          return NextResponse.json({ ok: false, error: "No email history fields provided" }, { status: 400 });
        }
        await db.emailHistory.updateMany({
          where: { id: entryId, clientId },
          data,
        });
        await auditLog({
          action: "update_email_history",
          entityType: "client",
          entityId: clientId,
          metadata: { entryId },
        });
        break;
      }
      case "emailHistory.delete": {
        const clientId = String(payload.clientId);
        await requireOwnedClient(clientId, session.user.id);
        const entryIds = Array.isArray(payload.entryIds)
          ? payload.entryIds.map((id) => String(id)).filter(Boolean)
          : [];
        if (entryIds.length === 0) {
          return NextResponse.json({ ok: false, error: "No email history ids provided" }, { status: 400 });
        }
        const [entries, client] = await Promise.all([
          db.emailHistory.findMany({
            where: { clientId, id: { in: entryIds } },
            select: {
              id: true,
              date: true,
              subject: true,
              body: true,
              templateLabel: true,
              policyId: true,
              policyNumber: true,
              policyLabel: true,
              communicationType: true,
            },
          }),
          db.client.findFirst({ where: { id: clientId, userId: session.user.id }, select: { notes: true } }),
        ]);
        await db.emailHistory.deleteMany({
          where: {
            clientId,
            id: { in: entryIds },
          },
        });
        const nextNotes = removeCommunicationNoteBlocks(
          client?.notes ?? undefined,
          entries.map((entry) => ({
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
        );
        if (nextNotes !== client?.notes) {
          await db.client.update({
            where: { id: clientId },
            data: { notes: nextNotes ?? null },
          });
        }
        await auditLog({
          action: "delete_email_history",
          entityType: "client",
          entityId: clientId,
          metadata: { count: entryIds.length },
        });
        break;
      }
      case "emailReminderSend.record": {
        const send = payload.reminderSend as EmailReminderSend;
        await requireOwnedClient(send.clientId, session.user.id);
        if (send.policyId) await requireOwnedPolicy(send.policyId, session.user.id);
        await db.emailReminderSend.create({
          data: {
            id: send.id,
            dedupeKey: send.dedupeKey,
            policyId: send.policyId ?? null,
            clientId: send.clientId,
            type: send.type,
            stage: send.stage ?? null,
            cycleKey: send.cycleKey,
            source: send.source ?? "manual",
            messageId: send.messageId ?? null,
            sentAt: toDate(send.sentAt) ?? new Date(),
            createdAt: toDate(send.createdAt) ?? new Date(),
          },
        }).catch(async (error) => {
          if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
            return null;
          }
          throw error;
        });
        await auditLog({
          action: "record_email_reminder_send",
          entityType: send.type,
          entityId: send.policyId ?? send.clientId,
        });
        break;
      }
      case "policy.markRenewalEmailSent": {
        await requireOwnedPolicy(String(payload.policyId), session.user.id);
        await db.policy.update({
          where: { id: String(payload.policyId) },
          data: { lastRenewalEmailAt: toDate(payload.at) ?? new Date() },
        });
        await auditLog({ action: "mark_renewal_email_sent", entityType: "policy", entityId: String(payload.policyId) });
        break;
      }
      case "client.markBirthdayEmailSent": {
        await requireOwnedClient(String(payload.clientId), session.user.id);
        await db.client.update({
          where: { id: String(payload.clientId) },
          data: { lastBirthdayEmailAt: toDate(payload.at) ?? new Date() },
        });
        await auditLog({ action: "mark_birthday_email_sent", entityType: "client", entityId: String(payload.clientId) });
        break;
      }
      case "client.prependNote": {
        const id = String(payload.clientId);
        await requireOwnedClient(id, session.user.id);
        const block = String(payload.block ?? "");
        const client = await db.client.findFirst({ where: { id, userId: session.user.id }, select: { notes: true } });
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
    console.error("[api/data] action failed", {
      userId: session.user.id,
      error,
    });
    return NextResponse.json(
      { ok: false, error: "Data action failed" },
      { status: 400 },
    );
  }
}
