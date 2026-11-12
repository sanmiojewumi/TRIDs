import { json, viewer } from "@/lib/auth";
import { reversePlace, searchPlaces, validCoord } from "@/lib/geo";
import { limited } from "@/lib/rate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const who = await viewer(request);
  if (who instanceof Response) return who;
  if (limited(`geo:${who.owner}`, 60, 60_000)) return json({ error: "Too many address lookups. Try again in a minute." }, 429);

  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (url.searchParams.has("lat") || url.searchParams.has("lng")) {
    if (!validCoord(lat, lng)) return json({ error: "That point is off the map." }, 400);
    const place = await reversePlace(lat, lng).catch(() => null);
    return json({ places: place ? [place] : [] });
  }

  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 180);
  if (query.length < 3) return json({ places: [] });
  const biasLat = Number(url.searchParams.get("biasLat"));
  const biasLng = Number(url.searchParams.get("biasLng"));
  const bias = validCoord(biasLat, biasLng) ? { lat: biasLat, lng: biasLng } : undefined;
  try {
    const places = await searchPlaces(query, bias);
    return json({ places });
  } catch {
    return json({ error: "Address search is unavailable right now." }, 502);
  }
}
