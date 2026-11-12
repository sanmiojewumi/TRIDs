"use client";

import { useEffect, useId, useState } from "react";
import { api } from "@/lib/client";
import type { Place } from "@/lib/types";

export function AddressField({
  label,
  value,
  placeholder,
  bias,
  onText,
  onPick,
}: {
  label: string;
  value: string;
  placeholder: string;
  bias?: { lat: number; lng: number };
  onText: (value: string) => void;
  onPick: (place: Place) => void;
}) {
  const listId = useId();
  const [places, setPlaces] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 3) {
      setPlaces([]);
      return;
    }
    const handle = setTimeout(() => {
      const params = new URLSearchParams({ q: query });
      if (bias) {
        params.set("biasLat", String(bias.lat));
        params.set("biasLng", String(bias.lng));
      }
      void api<{ places: Place[] }>(`/api/geocode?${params.toString()}`)
        .then((body) => setPlaces(body.places))
        .catch(() => setPlaces([]));
    }, 280);
    return () => clearTimeout(handle);
  }, [value, bias?.lat, bias?.lng]);

  return (
    <label className="field">
      <span>{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open && places.length > 0}
        aria-controls={listId}
        autoComplete="off"
        onChange={(event) => {
          onText(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
      />
      {open && places.length > 0 ? (
        <ul className="suggestions" id={listId} role="listbox">
          {places.map((place) => (
            <li key={`${place.lat},${place.lng},${place.label}`}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onPick(place);
                  setOpen(false);
                }}
              >
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </label>
  );
}
