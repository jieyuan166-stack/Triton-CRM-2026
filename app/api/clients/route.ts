// app/api/clients/route.ts
//
// GET  /api/clients?search=&provinces=ON,BC&tags=insurance,VIP&sortKey=name&sortDir=asc&page=1&perPage=25
// POST /api/clients   { ...ClientFormValues }
//
// Step 9 (now): operates on in-memory seed data. The seed module is shared
// with the client-side DataProvider so the response shape is identical.
//
// Step 10 (Prisma): replace the function bodies with:
//
//   GET:
//     const where: Prisma.ClientWhereInput = {
//       AND: [
//         search ? { OR: [{ firstName: { contains: search, mode: 'insensitive' } }, …] } : {},
//         provinces?.length ? { province: { in: provinces } } : {},
//         tags?.length     ? { tags: { hasSome: tags } } : {},
//       ],
//     };
//     const [rows, total] = await Promise.all([
//       db.client.findMany({ where, orderBy, skip, take: perPage, include: {...} }),
//       db.client.count({ where }),
//     ]);
//
//   POST:
//     const parsed = clientFormSchema.safeParse(body);
//     if (!parsed.success) return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });
//     const created = await db.client.create({ data: { ...parsed.data, tags: { set: parsed.data.tags } }});

import { NextResponse } from "next/server";
import { parseClientQueryParams, queryClients } from "@/lib/clients-query";
import { seedClients, seedFollowUps, seedPolicies } from "@/lib/mock-data";
import { clientFormSchema } from "@/lib/validators";
import type { Client } from "@/lib/types";
import { auditLog, requireSession, unauthorized } from "@/lib/api-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const query = parseClientQueryParams(url.searchParams);

  const result = queryClients(query, {
    clients: seedClients,
    policies: seedPolicies,
    followUps: seedFollowUps,
  });

  await auditLog({ action: "list_clients", entityType: "client" });
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // Server-side validation — re-runs the same Zod schema the client uses.
  // This is the trust boundary; never accept the client's word for it.
  const parsed = clientFormSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }
  const data = parsed.data;

  // Email uniqueness — Step 10 enforces this with a DB unique index. For now,
  // mirror the constraint against the seed.
  const emailLower = data.email.toLowerCase();
  if (
    seedClients.some((c) => c.email.toLowerCase() === emailLower)
  ) {
    return NextResponse.json(
      {
        error: "Email already in use",
        issues: { fieldErrors: { email: ["Email already in use"] } },
      },
      { status: 409 }
    );
  }

  // Linked-to existence check
  if (data.linkedToId && !seedClients.some((c) => c.id === data.linkedToId)) {
    return NextResponse.json(
      {
        error: "Linked client not found",
        issues: { fieldErrors: { linkedToId: ["Client not found"] } },
      },
      { status: 400 }
    );
  }

  const created: Client = {
    id: `cli_${Date.now().toString(36)}`,
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    phone: data.phone,
    streetAddress: data.streetAddress,
    unit: data.unit,
    city: data.city,
    province: data.province as Client["province"],
    postalCode: data.postalCode,
    birthday: data.birthday,
    linkedToId: data.linkedToId,
    relationship: data.relationship as Client["relationship"],
    notes: data.notes,
    createdAt: new Date().toISOString(),
  };

  // NOTE: Step 9 is read-mostly — the seed array is process-shared, so a POST
  // here mutates the in-memory copy until the server restarts. Step 10 swaps
  // this for `db.client.create(...)`.
  seedClients.push(created);
  await auditLog({
    action: "create_client",
    entityType: "client",
    entityId: created.id,
  });

  return NextResponse.json({ client: created }, { status: 201 });
}
