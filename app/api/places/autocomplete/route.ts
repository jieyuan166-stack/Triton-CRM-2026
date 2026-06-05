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

function googleMapsKey() {
  return process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
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

  return NextResponse.json({ ok: true, predictions });
}
