export interface Place {
  lat: number;
  lon: number;
  label: string;
}

const cache = new Map<string, Place>();
let lastLookup = 0;

function pace(): Promise<void> {
  const wait = 1100 - (Date.now() - lastLookup);
  lastLookup = Date.now() + Math.max(0, wait);
  return wait > 0 ? new Promise((resolve) => setTimeout(resolve, wait)) : Promise.resolve();
}

function key(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, ' ');
}

export type Lookup = { ok: true; place: Place } | { ok: false; query: string; suggestions: Place[]; message: string };

const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;

/** Decides whether a search is sure enough to use, or the person should pick. */
export function decideMatch(query: string, places: Place[]): Lookup {
  if (!places.length) {
    return {
      ok: false,
      query,
      suggestions: [],
      message: `No match for “${query}”. Add the street and postcode, such as 14 Victoria Street, Crewe CW1 2BP, then try again.`,
    };
  }
  if (places.length === 1 && confident(query, places[0].label)) return { ok: true, place: places[0] };
  return {
    ok: false,
    query,
    suggestions: places.slice(0, 5),
    message:
      places.length === 1
        ? `“${query}” is not an exact match. Use this place, or edit the address and add the postcode.`
        : `“${query}” matches more than one place. Pick the right one, or edit the address and add the postcode.`,
  };
}

function confident(query: string, label: string): boolean {
  const postcode = query.match(POSTCODE);
  const compact = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (postcode && compact(label).includes(compact(postcode[1] + postcode[2]))) return true;
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !['the', 'and', 'near'].includes(word));
  const hay = label.toLowerCase();
  const hits = words.filter((word) => hay.includes(word));
  return words.length > 0 && hits.length >= Math.min(2, words.length);
}

/** Turns a UK address into coordinates, or a list of places to choose from. */
export async function lookupAddress(address: string): Promise<Lookup> {
  const id = key(address);
  const saved = cache.get(id) ?? readCache(id);
  if (saved) {
    cache.set(id, saved);
    return { ok: true, place: saved };
  }
  let places = await searchPlaces(address, 5);
  let decision = decideMatch(address, places);
  if (!decision.ok && decision.suggestions.length === 0) {
    places = await fallbackPlaces(address);
    decision = decideMatch(address, places);
    if (!decision.ok && decision.suggestions.length) {
      decision = { ...decision, message: `No exact match for “${address}”. These are the closest places. Pick one, or edit the address and add the postcode.` };
    }
  }
  if (decision.ok) remember(address, decision.place);
  return decision;
}

export function remember(address: string, place: Place) {
  const id = key(address);
  cache.set(id, place);
  writeCache(id, place);
}

export async function reverseGeocode(lat: number, lon: number): Promise<Place> {
  const id = `gps:${lat.toFixed(4)},${lon.toFixed(4)}`;
  const saved = cache.get(id) ?? readCache(id);
  if (saved) return saved;
  await pace();
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) return { lat, lon, label: 'My location' };
  const body = (await response.json()) as { display_name?: string; lat?: string; lon?: string };
  const place = { lat: Number(body.lat ?? lat), lon: Number(body.lon ?? lon), label: body.display_name || 'My location' };
  cache.set(id, place);
  writeCache(id, place);
  return place;
}

async function searchPlaces(address: string, limit: number): Promise<Place[]> {
  await pace();
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('countrycodes', 'gb');
  url.searchParams.set('q', address);
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Could not look up that address. Check the connection and try again.');
  const rows = (await response.json()) as { lat: string; lon: string; display_name: string }[];
  return rows.map((row) => ({ lat: Number(row.lat), lon: Number(row.lon), label: row.display_name }));
}

async function fallbackPlaces(address: string): Promise<Place[]> {
  const queries = new Set<string>();
  const postcode = address.match(POSTCODE);
  if (postcode) queries.add(`${postcode[1]} ${postcode[2]}`);
  const tail = address.split(',').map((part) => part.trim()).filter(Boolean).pop();
  if (tail && tail.toLowerCase() !== address.trim().toLowerCase()) queries.add(tail);
  const withoutNumber = address.replace(/^\s*\d+[a-z]?\s+/i, '').trim();
  if (withoutNumber && withoutNumber.toLowerCase() !== address.trim().toLowerCase()) queries.add(withoutNumber);
  const found: Place[] = [];
  for (const query of queries) {
    const rows = await searchPlaces(query, 3);
    for (const place of rows) {
      if (!found.some((item) => item.label === place.label)) found.push(place);
    }
    if (found.length >= 5) break;
  }
  return found.slice(0, 5);
}

/** Road line through the points, for the map shown before a satnav is opened. */
export async function drivePath(points: { lat: number; lon: number }[]): Promise<{ lat: number; lon: number }[]> {
  if (points.length < 2) return points;
  const path = points.map((point) => `${point.lon},${point.lat}`).join(';');
  try {
    const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${path}?overview=simplified&geometries=geojson`);
    if (!response.ok) return points;
    const body = (await response.json()) as { code?: string; routes?: { geometry?: { coordinates?: [number, number][] } }[] };
    const coordinates = body.code === 'Ok' ? body.routes?.[0]?.geometry?.coordinates : undefined;
    if (!coordinates?.length) return points;
    return coordinates.map(([lon, lat]) => ({ lat, lon }));
  } catch {
    return points;
  }
}

/** Drive minutes between points. Index 0 is the start of the day. */
export async function driveMinutes(points: { lat: number; lon: number }[]): Promise<number[][]> {
  if (points.length < 2) return points.map(() => points.map(() => 0));
  const path = points.map((point) => `${point.lon},${point.lat}`).join(';');
  const url = `https://router.project-osrm.org/table/v1/driving/${path}?annotations=duration`;
  const response = await fetch(url);
  if (!response.ok) return estimate(points);
  const body = (await response.json()) as { code?: string; durations?: (number | null)[][] };
  if (body.code !== 'Ok' || !body.durations) return estimate(points);
  return body.durations.map((row) => row.map((seconds) => Math.max(1, Math.round((seconds ?? 0) / 60))));
}

function estimate(points: { lat: number; lon: number }[]): number[][] {
  return points.map((from) =>
    points.map((to) => {
      if (from === to) return 0;
      const miles = haversine(from, to);
      return Math.max(1, Math.round((miles / 28) * 60));
    }),
  );
}

function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const GEO_KEY = 'trids-routes.geo';

function readCache(id: string): Place | undefined {
  try {
    const all = JSON.parse(localStorage.getItem(GEO_KEY) || '{}') as Record<string, Place>;
    return all[id];
  } catch {
    return undefined;
  }
}

function writeCache(id: string, place: Place) {
  try {
    const all = JSON.parse(localStorage.getItem(GEO_KEY) || '{}') as Record<string, Place>;
    all[id] = place;
    localStorage.setItem(GEO_KEY, JSON.stringify(all));
  } catch {
    /* a full cache should not block planning */
  }
}
