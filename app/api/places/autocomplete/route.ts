import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession, unauthorized } from "@/lib/api-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  input: z.string().trim().min(2).max(160),
  sessionToken: z.string().trim().max(128).optional(),
});

type GoogleAutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: {
        mainText?: { text?: string };
        secondaryText?: { text?: string };
      };
    };
  }>;
};

type NominatimSearchResult = {
  osm_type?: string;
  osm_id?: number;
  display_name?: string;
  name?: string;
  address?: {
    house_number?: string;
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    postcode?: string;
    country_code?: string;
  };
};

function googleMapsKey() {
  return process.env.GOOGLE_MAPS_API_KEY;
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

function nominatimOsmId(result: NominatimSearchResult) {
  const type = result.osm_type?.toLowerCase();
  const prefix = type === "node" ? "N" : type === "way" ? "W" : type === "relation" ? "R" : "";
  return prefix && result.osm_id ? `${prefix}${result.osm_id}` : undefined;
}

async function nominatimPredictions(input: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "ca");
  url.searchParams.set("limit", "6");
  url.searchParams.set("q", input);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "TritonCRM/1.0 (https://crm.tritonwealth.ca)",
      "Accept-Language": "en-CA,en",
    },
  });
  if (!response.ok) return [];

  const rows = (await response.json()) as NominatimSearchResult[];
  return rows
    .filter((row) => row.address?.country_code?.toLowerCase() === "ca")
    .map((row) => {
      const osmId = nominatimOsmId(row);
      if (!osmId) return null;
      const street = [row.address?.house_number, row.address?.road].filter(Boolean).join(" ");
      const mainText = street || row.name || row.display_name || "";
      const city =
        row.address?.city ??
        row.address?.town ??
        row.address?.village ??
        row.address?.municipality ??
        row.address?.suburb;
      const province = provinceCode(row.address?.state);
      const secondaryText = [city, province, row.address?.postcode].filter(Boolean).join(", ");
      return {
        placeId: `osm:${osmId}`,
        description: row.display_name ?? [mainText, secondaryText].filter(Boolean).join(", "),
        mainText,
        secondaryText,
      };
    })
    .filter((row): row is NonNullable<typeof row> => !!row?.mainText);
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
    const predictions = await nominatimPredictions(parsed.data.input);
    return NextResponse.json({ ok: true, predictions, provider: "nominatim" });
  }

  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
    },
    body: JSON.stringify({
      input: parsed.data.input,
      includedRegionCodes: ["ca"],
      sessionToken: parsed.data.sessionToken,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.warn("[places:autocomplete] Google request failed", {
      status: response.status,
      body: body.slice(0, 500),
    });
    const predictions = await nominatimPredictions(parsed.data.input).catch(() => []);
    if (predictions.length) {
      return NextResponse.json({ ok: true, predictions, provider: "nominatim" });
    }
    return NextResponse.json({ ok: false, error: "Address autocomplete is unavailable" }, { status: 502 });
  }

  const data = (await response.json()) as GoogleAutocompleteResponse;
  const predictions =
    data.suggestions
      ?.map((suggestion) => suggestion.placePrediction)
      .filter((prediction): prediction is NonNullable<typeof prediction> => !!prediction?.placeId)
      .map((prediction) => ({
        placeId: prediction.placeId!,
        description: prediction.text?.text ?? "",
        mainText: prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? "",
        secondaryText: prediction.structuredFormat?.secondaryText?.text ?? "",
      })) ?? [];

  if (predictions.length === 0) {
    const fallback = await nominatimPredictions(parsed.data.input).catch(() => []);
    if (fallback.length) return NextResponse.json({ ok: true, predictions: fallback, provider: "nominatim" });
  }

  return NextResponse.json({ ok: true, predictions, provider: "google" });
}
