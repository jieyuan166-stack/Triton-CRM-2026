// lib/google-maps.ts
// Singleton loader for the Google Maps JavaScript API ("places" library).
// Uses the functional API from @googlemaps/js-api-loader v2.
//
// Usage:
//   const places = await loadPlacesLibrary();
//   if (!places) return;  // key missing or load failed — degrade gracefully
//   const svc = new places.AutocompleteService();

import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

let configured = false;
let cached: Promise<google.maps.PlacesLibrary | null> | null = null;

export function loadPlacesLibrary(): Promise<google.maps.PlacesLibrary | null> {
  if (cached) return cached;

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (!apiKey) {
    // Resolve to null so callers can degrade silently — expected in dev
    // when the env var is unset.
    cached = Promise.resolve(null);
    return cached;
  }

  if (!configured) {
    setOptions({ key: apiKey, v: "weekly" });
    configured = true;
  }

  cached = importLibrary("places")
    .then((lib) => lib)
    .catch((err: unknown) => {
       
      console.warn("[google-maps] load failed — autocomplete disabled", err);
      return null;
    });

  return cached;
}

/** Was the API key configured at build time? */
export function isGoogleMapsConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
}
