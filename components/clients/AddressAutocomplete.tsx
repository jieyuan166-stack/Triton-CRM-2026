// components/clients/AddressAutocomplete.tsx
//
// Address input with Google Places autocomplete.
//
// Behaviour:
//   - Plain controlled text input — `value` / `onChange` always work.
//   - As the user types, debounced (~180 ms) calls to the CRM Places API
//     proxy return predictions, rendered as an absolute-positioned dropdown.
//   - On selection, fetch place details through the proxy, fire
//     `onAddressSelect` so the host form can populate city / province /
//     postalCode in one shot.
//   - If Google Places is unavailable, the input degrades silently to plain
//     text — no errors, no flicker.
//
// Country restricted to Canada to match the Triton book.

"use client";

import {
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

type AddressPrediction = {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText?: string;
  googlePlacePrediction?: google.maps.places.PlacePrediction;
};

type BrowserPlaceDetails = {
  formatted_address?: string;
  formattedAddress?: string | null;
  name?: string;
  displayName?: string | null;
  address_components?: BrowserAddressComponent[];
  addressComponents?: BrowserAddressComponent[];
};

type BrowserAddressComponent = {
    long_name?: string;
    short_name?: string;
    longText?: string | null;
    shortText?: string | null;
    types?: string[];
};

function parseBrowserAddress(place: BrowserPlaceDetails): ParsedAddress {
  const components = place.addressComponents ?? place.address_components ?? [];
  const get = (type: string, short = false) => {
    const component = components.find((item) => item.types?.includes(type));
    return short
      ? component?.shortText ?? component?.short_name
      : component?.longText ?? component?.long_name;
  };
  const streetNumber = get("street_number") ?? "";
  const route = get("route") ?? "";
  const streetAddress = [streetNumber, route].filter(Boolean).join(" ");

  return {
    streetAddress:
      streetAddress ||
      place.displayName ||
      place.name ||
      place.formattedAddress ||
      place.formatted_address ||
      "",
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

  const sessionTokenRef = useRef(`addr_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const browserSessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const [predictions, setPredictions] = useState<AddressPrediction[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hasFocus, setHasFocus] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function resetSessionToken() {
    sessionTokenRef.current = `addr_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    browserSessionTokenRef.current = null;
  }

  async function getBrowserSessionToken(places: google.maps.PlacesLibrary) {
    if (!browserSessionTokenRef.current) {
      browserSessionTokenRef.current = new places.AutocompleteSessionToken();
    }
    return browserSessionTokenRef.current;
  }

  async function queryBrowserPredictions(input: string): Promise<AddressPrediction[] | null> {
    const places = await loadPlacesLibrary();
    if (!places) return null;
    const token = await getBrowserSessionToken(places);

    if (places?.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
      try {
        const { suggestions } =
          await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input,
            includedRegionCodes: ["ca"],
            region: "CA",
            language: "en-CA",
            sessionToken: token,
          });
        const next = suggestions
          .map((suggestion) => suggestion.placePrediction)
          .filter((prediction): prediction is google.maps.places.PlacePrediction => !!prediction)
          .map((prediction) => ({
            placeId: prediction.placeId,
            description: prediction.text.text,
            mainText: prediction.mainText?.text ?? prediction.text.text,
            secondaryText: prediction.secondaryText?.text ?? undefined,
            googlePlacePrediction: prediction,
          }));
        return next.length > 0 ? next : null;
      } catch (error) {
        console.warn("[address-autocomplete] Google Places New failed", error);
      }
    }

    if (!places?.AutocompleteService) return null;
    const service = new places.AutocompleteService();

    return new Promise((resolve) => {
      service.getPlacePredictions(
        {
          input,
          componentRestrictions: { country: "ca" },
          sessionToken: token,
        },
        (results, status) => {
          const ok = status === google.maps.places.PlacesServiceStatus.OK;
          if (!ok || !results) {
            resolve(null);
            return;
          }
          resolve(
            results.map((prediction) => ({
              placeId: prediction.place_id,
              description: prediction.description,
              mainText:
                prediction.structured_formatting?.main_text ??
                prediction.description,
              secondaryText: prediction.structured_formatting?.secondary_text,
            }))
          );
        }
      );
    });
  }

  async function fetchBrowserDetails(placeId: string): Promise<ParsedAddress | null> {
    const places = await loadPlacesLibrary();
    if (!places?.PlacesService) return null;
    const token = await getBrowserSessionToken(places);
    const container = document.createElement("div");
    const service = new places.PlacesService(container);

    return new Promise((resolve) => {
      service.getDetails(
        {
          placeId,
          fields: ["address_components", "formatted_address", "name"],
          sessionToken: token,
        },
        (place, status) => {
          const ok = status === google.maps.places.PlacesServiceStatus.OK;
          if (!ok || !place) {
            resolve(null);
            return;
          }
          resolve(parseBrowserAddress(place as BrowserPlaceDetails));
        }
      );
    });
  }

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
      try {
        const browserPredictions = await queryBrowserPredictions(input);
        if (browserPredictions) {
          setPredictions(browserPredictions);
          setOpen(browserPredictions.length > 0);
          return;
        }

        const response = await fetch("/api/places/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input,
            sessionToken: sessionTokenRef.current,
          }),
        });
        if (!response.ok) {
          setPredictions([]);
          setOpen(false);
          return;
        }
        const data = (await response.json()) as {
          predictions?: AddressPrediction[];
        };
        const next = data.predictions ?? [];
        setPredictions(next);
        setOpen(next.length > 0);
      } catch {
        setPredictions([]);
        setOpen(false);
      }
    }, 180);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    onChange(next);
    queryPredictions(next);
  }

  function handleFocus() {
    setHasFocus(true);
    if (predictions.length > 0) setOpen(true);
  }

  function handleBlur() {
    setHasFocus(false);
  }

  async function selectPrediction(p: AddressPrediction) {
    try {
      if (p.googlePlacePrediction) {
        try {
          const place = p.googlePlacePrediction.toPlace();
          const { place: hydrated } = await place.fetchFields({
            fields: ["addressComponents", "formattedAddress", "displayName"],
          });
          const parsed = parseBrowserAddress(hydrated as unknown as BrowserPlaceDetails);
          if (parsed.streetAddress) {
            onChange(parsed.streetAddress || p.description);
            onAddressSelect?.(parsed);
            setOpen(false);
            setPredictions([]);
            resetSessionToken();
            return;
          }
        } catch (error) {
          console.warn("[address-autocomplete] Google Places New details failed", error);
        }
      }

      const browserParsed = await fetchBrowserDetails(p.placeId);
      if (browserParsed) {
        onChange(browserParsed.streetAddress || p.description);
        onAddressSelect?.(browserParsed);
        setOpen(false);
        setPredictions([]);
        resetSessionToken();
        return;
      }

      const response = await fetch("/api/places/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeId: p.placeId,
          sessionToken: sessionTokenRef.current,
        }),
      });
      if (!response.ok) return;
      const data = (await response.json()) as {
        address?: ParsedAddress;
      };
      const parsed = data.address;
      if (!parsed) return;
      onChange(parsed.streetAddress || p.description);
      onAddressSelect?.(parsed);
      setOpen(false);
      setPredictions([]);
      resetSessionToken();
    } catch {
      // Gracefully keep the typed address if Google details fail.
    }
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
                key={p.placeId}
                id={`${inputId}-opt-${i}`}
                role="option"
                aria-selected={isActive}
              >
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => void selectPrediction(p)}
                  className={cn(
                    "w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors",
                    isActive ? "bg-slate-100" : "hover:bg-slate-50"
                  )}
                >
                  <MapPin className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-slate-900 truncate">
                      {p.mainText || p.description}
                    </span>
                    {p.secondaryText ? (
                      <span className="block text-xs text-slate-500 truncate">
                        {p.secondaryText}
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
