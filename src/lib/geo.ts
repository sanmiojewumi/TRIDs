import type { MatrixJson, Place } from "./types";

const PHOTON = "photon.komoot.io";
const OSRM = "router.project-osrm.org";

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, string | undefined>;
};

let queue: Promise<unknown> = Promise.resolve();

function paced<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => new Promise((resolve) => setTimeout(resolve, 120)),
    () => new Promise((resolve) => setTimeout(resolve, 120)),
  );
  return run;
}

function placeLabel(properties: Record<string, string | undefined>): string {
  const street = [properties.housenumber, properties.street].filter(Boolean).join(" ");
  const name = properties.name && properties.name !== street ? properties.name : "";
  const line = [name, street].filter(Boolean).join(", ");
  const city = properties.city || properties.locality || properties.district || properties.county || "";
  return [line, city, properties.state, properties.postcode, properties.country].filter(Boolean).join(", ");
}

async function photon(url: URL): Promise<PhotonFeature[]> {
  if (url.hostname !== PHOTON) throw new Error("Unexpected geocoder host");
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "TRIDsRoutePlanner/1.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`geocode ${response.status}`);
  const body = (await response.json()) as { features?: PhotonFeature[] };
  return body.features ?? [];
}

function toPlaces(features: PhotonFeature[]): Place[] {
  const places: Place[] = [];
  const seen = new Set<string>();
  for (const feature of features) {
    const pair = feature.geometry?.coordinates;
    if (!pair) continue;
    const [lng, lat] = pair;
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const label = placeLabel(feature.properties ?? {});
    if (!label || seen.has(label)) continue;
    seen.add(label);
    places.push({ label, lat, lng });
  }
  return places;
}

const searchCache = new Map<string, Place[]>();

export function searchPlaces(query: string, bias?: { lat: number; lng: number }): Promise<Place[]> {
  const key = `${query.toLowerCase()}|${bias ? `${bias.lat.toFixed(2)},${bias.lng.toFixed(2)}` : ""}`;
  const cached = searchCache.get(key);
  if (cached) return Promise.resolve(cached);
  return paced(async () => {
    const url = new URL("https://photon.komoot.io/api/");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "5");
    if (bias && Number.isFinite(bias.lat) && Number.isFinite(bias.lng)) {
      url.searchParams.set("lat", bias.lat.toFixed(5));
      url.searchParams.set("lon", bias.lng.toFixed(5));
    }
    const places = toPlaces(await photon(url));
    searchCache.set(key, places);
    if (searchCache.size > 400) {
      const oldest = searchCache.keys().next().value;
      if (oldest) searchCache.delete(oldest);
    }
    return places;
  });
}

export function reversePlace(lat: number, lng: number): Promise<Place | null> {
  return paced(async () => {
    const url = new URL("https://photon.komoot.io/reverse");
    url.searchParams.set("lat", lat.toFixed(6));
    url.searchParams.set("lon", lng.toFixed(6));
    const places = toPlaces(await photon(url));
    return places[0] ?? null;
  });
}

export function validCoord(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const radius = 6371000;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dp = ((b.lat - a.lat) * Math.PI) / 180;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function estimateMatrix(points: { id: string; lat: number; lng: number }[]): MatrixJson {
  const seconds = points.map((from) =>
    points.map((to) => {
      if (from.id === to.id) return 0;
      const road = haversineMeters(from, to) * 1.35;
      return Math.max(1, Math.round(road / 12.5));
    }),
  );
  const meters = points.map((from) =>
    points.map((to) => (from.id === to.id ? 0 : Math.round(haversineMeters(from, to) * 1.35))),
  );
  return { ids: points.map((point) => point.id), seconds, meters };
}

export async function roadMatrix(
  points: { id: string; lat: number; lng: number }[],
): Promise<{ matrix: MatrixJson; routing: "road" | "estimated" }> {
  const estimated = estimateMatrix(points);
  try {
    const path = points.map((point) => `${point.lng.toFixed(6)},${point.lat.toFixed(6)}`).join(";");
    const url = new URL(`https://${OSRM}/table/v1/driving/${path}`);
    url.searchParams.set("annotations", "duration,distance");
    if (url.hostname !== OSRM) throw new Error("Unexpected router host");
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) return { matrix: estimated, routing: "estimated" };
    const body = (await response.json()) as {
      code?: string;
      durations?: Array<Array<number | null>>;
      distances?: Array<Array<number | null>>;
    };
    if (body.code !== "Ok" || !body.durations || !body.distances) {
      return { matrix: estimated, routing: "estimated" };
    }
    const seconds = body.durations.map((row, i) =>
      row.map((value, j) =>
        value == null || !Number.isFinite(value) ? estimated.seconds[i][j] : Math.max(0, Math.round(value)),
      ),
    );
    const meters = body.distances.map((row, i) =>
      row.map((value, j) =>
        value == null || !Number.isFinite(value) ? estimated.meters[i][j] : Math.max(0, Math.round(value)),
      ),
    );
    return { matrix: { ids: estimated.ids, seconds, meters }, routing: "road" };
  } catch {
    return { matrix: estimated, routing: "estimated" };
  }
}

export async function roadLine(points: { lat: number; lng: number }[]): Promise<[number, number][]> {
  const straight = points.map((point) => [point.lat, point.lng] as [number, number]);
  if (points.length < 2) return straight;
  try {
    const path = points.map((point) => `${point.lng.toFixed(6)},${point.lat.toFixed(6)}`).join(";");
    const url = new URL(`https://${OSRM}/route/v1/driving/${path}`);
    url.searchParams.set("overview", "full");
    url.searchParams.set("geometries", "geojson");
    url.searchParams.set("steps", "false");
    if (url.hostname !== OSRM) return straight;
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) return straight;
    const body = (await response.json()) as {
      code?: string;
      routes?: Array<{ geometry?: { coordinates?: Array<[number, number]> } }>;
    };
    const coordinates = body.routes?.[0]?.geometry?.coordinates;
    if (body.code !== "Ok" || !coordinates || coordinates.length < 2) return straight;
    const line = coordinates
      .filter((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]))
      .map((pair) => [pair[1], pair[0]] as [number, number]);
    if (line.length <= 4000) return line;
    const step = Math.ceil(line.length / 4000);
    const thinned = line.filter((_, index) => index % step === 0);
    thinned.push(line[line.length - 1]);
    return thinned;
  } catch {
    return straight;
  }
}
