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

/** Turns a UK address into coordinates. Results are remembered on this device. */
export async function geocode(address: string): Promise<Place> {
  const id = key(address);
  const saved = cache.get(id) ?? readCache(id);
  if (saved) {
    cache.set(id, saved);
    return saved;
  }
  await pace();
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'gb');
  url.searchParams.set('q', address);
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Could not look up that address. Check the connection and try again.');
  const rows = (await response.json()) as { lat: string; lon: string; display_name: string }[];
  if (!rows.length) throw new Error(`No match for “${address}”. Add the postcode and try again.`);
  const place = { lat: Number(rows[0].lat), lon: Number(rows[0].lon), label: rows[0].display_name };
  cache.set(id, place);
  writeCache(id, place);
  return place;
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
