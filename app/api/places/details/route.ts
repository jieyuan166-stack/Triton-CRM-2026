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

type NominatimLookupResult = {
  display_name?: string;
  name?: string;
  address?: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    suburb?: string;
    county?: string;
    state?: string;
    postcode?: string;
  };
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

function provinceCode(value?: string) {
  const normalized = value?.toLowerCase();
  if (!normalized) return undefined;
  const map: Record<string, string> = {
    alberta: "AB",
    "british columbia": "BC",
    ontario: "ON",
  };
  return map[normalized] ?? value;
}

function parseNominatimAddress(place: NominatimLookupResult) {
  const address = place.address ?? {};
  const streetAddress = [address.house_number, address.road].filter(Boolean).join(" ");
  return {
    streetAddress: streetAddress || place.name || place.display_name || "",
    city:
      address.city ??
      address.town ??
      address.village ??
      address.municipality ??
      address.suburb ??
      address.county ??
      undefined,
    province: provinceCode(address.state),
    postalCode: address.postcode,
  };
}

async function nominatimDetails(placeId: string) {
  const osmId = placeId.replace(/^osm:/, "");
  if (!/^[NWR]\d+$/.test(osmId)) return null;

  const url = new URL("https://nominatim.openstreetmap.org/lookup");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("osm_ids", osmId);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "TritonCRM/1.0 (https://crm.tritonwealth.ca)",
      "Accept-Language": "en-CA,en",
    },
  });
  if (!response.ok) return null;
  const rows = (await response.json()) as NominatimLookupResult[];
  return rows[0] ? parseNominatimAddress(rows[0]) : null;
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const key = googleMapsKey();
  if (parsed.data.placeId.startsWith("osm:")) {
    const address = await nominatimDetails(parsed.data.placeId);
    if (address) return NextResponse.json({ ok: true, address, provider: "nominatim" });
    return NextResponse.json({ ok: false, error: "Address details are unavailable" }, { status: 502 });
  }

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
