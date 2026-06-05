import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession, unauthorized } from "@/lib/api-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  placeId: z.string().trim().min(3).max(256),
  sessionToken: z.string().trim().max(128).optional(),
});

type GooglePlaceDetailsResponse = {
  formattedAddress?: string;
  displayName?: { text?: string };
  addressComponents?: Array<{
    longText?: string;
    shortText?: string;
    types?: string[];
  }>;
};

function googleMapsKey() {
  return process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
}

function parseAddress(place: GooglePlaceDetailsResponse) {
  const components = place.addressComponents ?? [];
  const get = (type: string, short = false) => {
    const component = components.find((item) => item.types?.includes(type));
    return short ? component?.shortText : component?.longText;
  };

  const streetNumber = get("street_number") ?? "";
  const route = get("route") ?? "";
  const streetAddress = [streetNumber, route].filter(Boolean).join(" ");

  return {
    streetAddress: streetAddress || place.displayName?.text || place.formattedAddress || "",
    city:
      get("locality") ??
      get("postal_town") ??
      get("administrative_area_level_2") ??
      get("sublocality") ??
      undefined,
    province: get("administrative_area_level_1", true),
    postalCode: get("postal_code"),
  };
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const key = googleMapsKey();
  if (!key) {
    return NextResponse.json({ ok: false, error: "Google Maps API key is not configured" }, { status: 500 });
  }

  const placeName = parsed.data.placeId.startsWith("places/")
    ? parsed.data.placeId
    : `places/${parsed.data.placeId}`;
  const url = new URL(`https://places.googleapis.com/v1/${placeName}`);
  url.searchParams.set("sessionToken", parsed.data.sessionToken ?? "");

  const response = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "formattedAddress,displayName,addressComponents",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.warn("[places:details] Google request failed", {
      status: response.status,
      body: body.slice(0, 500),
    });
    return NextResponse.json({ ok: false, error: "Address details are unavailable" }, { status: 502 });
  }

  const data = (await response.json()) as GooglePlaceDetailsResponse;
  return NextResponse.json({ ok: true, address: parseAddress(data) });
}
