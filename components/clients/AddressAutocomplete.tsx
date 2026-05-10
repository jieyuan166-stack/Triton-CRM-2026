// components/clients/AddressAutocomplete.tsx
//
// Address input with Google Places autocomplete.
//
// Behaviour:
//   - Plain controlled text input — `value` / `onChange` always work.
//   - On focus, lazy-load the Google Maps "places" library (one tag per page
//     via lib/google-maps.ts singleton).
//   - As the user types, debounced (~180 ms) calls to AutocompleteService
//     return predictions, rendered as an absolute-positioned dropdown.
//   - On selection, fetch place details, parse address components, fire
//     `onAddressSelect` so the host form can populate city / province /
//     postalCode in one shot.
//   - Without NEXT_PUBLIC_GOOGLE_MAPS_KEY (or on load failure), the input
//     degrades silently to plain text — no errors, no flicker.
//
// Country restricted to Canada to match the Triton book.

"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { loadPlacesLibrary } from "@/lib/google-maps";
import { cn } from "@/lib/utils";

export interface ParsedAddress {
  streetAddress: string;
  city?: string;
  province?: string;
  postalCode?: string;
}

export interface AddressAutocompleteProps {
  value: string;
  onChange: (next: string) => void;
  onAddressSelect?: (parsed: ParsedAddress) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
}

// === Component ===

export function AddressAutocomplete({
  value,
  onChange,
  onAddressSelect,
  placeholder = "Start typing your address...",
  className,
  id,
  disabled,
}: AddressAutocompleteProps) {
  const reactId = useId();
  const inputId = id ?? reactId;

  // The Google services. Null until first focus + successful load.
  const autocompleteRef = useRef<google.maps.places.AutocompleteService | null>(
    null
  );
  const placesRef = useRef<google.maps.places.PlacesService | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(
    null
  );

  const [predictions, setPredictions] = useState<
    google.maps.places.AutocompletePrediction[]
  >([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hasFocus, setHasFocus] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lazy-load the API on first focus.
  const ensureLoaded = useCallback(async () => {
    if (autocompleteRef.current) return true;
    const places = await loadPlacesLibrary();
    if (!places) return false;
    autocompleteRef.current = new places.AutocompleteService();
    // PlacesService needs a host element; an offscreen div is conventional.
    placesRef.current = new places.PlacesService(
      document.createElement("div")
    );
    sessionTokenRef.current = new places.AutocompleteSessionToken();
    return true;
  }, []);

  // Click-outside / Escape to close
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Reset active index whenever predictions change.
  useEffect(() => {
    setActiveIndex(0);
  }, [predictions]);

  // Debounced predictions fetch
  function queryPredictions(input: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!input || input.trim().length < 2) {
      setPredictions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const ok = await ensureLoaded();
      if (!ok || !autocompleteRef.current) return;
      autocompleteRef.current.getPlacePredictions(
        {
          input,
          sessionToken: sessionTokenRef.current ?? undefined,
          componentRestrictions: { country: ["ca"] },
          types: ["address"],
        },
        (preds) => {
          setPredictions(preds ?? []);
          setOpen((preds ?? []).length > 0);
        }
      );
    }, 180);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    onChange(next);
    queryPredictions(next);
  }

  function handleFocus() {
    setHasFocus(true);
    void ensureLoaded();
    if (predictions.length > 0) setOpen(true);
  }

  function handleBlur() {
    setHasFocus(false);
  }

  function selectPrediction(p: google.maps.places.AutocompletePrediction) {
    if (!placesRef.current) return;
    placesRef.current.getDetails(
      {
        placeId: p.place_id,
        fields: ["address_components", "formatted_address", "name"],
        sessionToken: sessionTokenRef.current ?? undefined,
      },
      (place, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
          return;
        }
        const parsed = parseAddressComponents(place);
        // Populate the visible input with the street line we extracted; if
        // empty, fall back to the formatted string (rare).
        onChange(parsed.streetAddress || place.formatted_address || p.description);
        onAddressSelect?.(parsed);
        setOpen(false);
        setPredictions([]);
        // Each session ends with getDetails; mint a fresh token for the next.
        loadPlacesLibrary().then((places) => {
          if (places) {
            sessionTokenRef.current = new places.AutocompleteSessionToken();
          }
        });
      }
    );
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || predictions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % predictions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(
        (i) => (i - 1 + predictions.length) % predictions.length
      );
    } else if (e.key === "Enter") {
      const p = predictions[activeIndex];
      if (p) {
        e.preventDefault();
        selectPrediction(p);
      }
    }
  }

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none z-10" />
      <Input
        id={inputId}
        autoComplete="address-line1"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${inputId}-listbox`}
        aria-activedescendant={
          open && predictions[activeIndex]
            ? `${inputId}-opt-${activeIndex}`
            : undefined
        }
        className="pl-9"
      />

      {open && hasFocus && predictions.length > 0 ? (
        <ul
          id={`${inputId}-listbox`}
          role="listbox"
          className="absolute left-0 right-0 mt-1.5 bg-white rounded-xl border border-slate-200 shadow-2xl ring-1 ring-black/5 z-50 max-h-72 overflow-y-auto py-1"
        >
          {predictions.map((p, i) => {
            const isActive = i === activeIndex;
            return (
              <li
                key={p.place_id}
                id={`${inputId}-opt-${i}`}
                role="option"
                aria-selected={isActive}
              >
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => selectPrediction(p)}
                  className={cn(
                    "w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors",
                    isActive ? "bg-slate-100" : "hover:bg-slate-50"
                  )}
                >
                  <MapPin className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-slate-900 truncate">
                      {p.structured_formatting?.main_text ?? p.description}
                    </span>
                    {p.structured_formatting?.secondary_text ? (
                      <span className="block text-xs text-slate-500 truncate">
                        {p.structured_formatting.secondary_text}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

// === Address component parser ===

/** Map a Google PlaceResult to our app schema. Province returned as the
 *  2-letter `short_name` (e.g. "ON") to align with PROVINCE_CODES. */
function parseAddressComponents(
  place: google.maps.places.PlaceResult
): ParsedAddress {
  const components = place.address_components ?? [];

  const get = (type: string, short = false): string | undefined => {
    const c = components.find((x) => x.types.includes(type));
    if (!c) return undefined;
    return short ? c.short_name : c.long_name;
  };

  const streetNumber = get("street_number") ?? "";
  const route = get("route") ?? "";
  const streetAddress = [streetNumber, route].filter(Boolean).join(" ");

  return {
    streetAddress: streetAddress || place.name || "",
    city:
      get("locality") ??
      get("postal_town") ??
      get("administrative_area_level_2") ??
      get("sublocality") ??
      undefined,
    province: get("administrative_area_level_1", true), // "ON" / "BC" / "AB" / etc.
    postalCode: get("postal_code"),
  };
}
