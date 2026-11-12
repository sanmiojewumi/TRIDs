import { json, readJson, viewer } from "@/lib/auth";
import { roadLine, roadMatrix, searchPlaces, validCoord } from "@/lib/geo";
import { END_ID, START_ID, matrixFromJson, optimizeRoute, parseClock, scheduleRoute } from "@/lib/optimize";
import { toOptBreak, toOptStop } from "@/lib/plan";
import { limited } from "@/lib/rate";
import type { RoutePlan, Stop } from "@/lib/types";
import { validatePlan } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Point = { lat: number; lng: number; address: string };

async function locate(
  address: string,
  lat: number | null,
  lng: number | null,
  bias?: { lat: number; lng: number },
): Promise<Point | null> {
  if (lat != null && lng != null && validCoord(lat, lng)) return { lat, lng, address };
  const query = address.trim();
  if (query.length < 3) return null;
  const places = await searchPlaces(query, bias);
  const place = places[0];
  if (!place) return null;
  return { lat: place.lat, lng: place.lng, address: address.trim() || place.label };
}

function deadlineSec(value: string, startSec: number): number | null {
  const minutes = parseClock(value);
  if (minutes == null) return null;
  let seconds = minutes * 60;
  if (seconds + 6 * 3600 < startSec) seconds += 24 * 3600;
  return seconds;
}

export async function POST(request: Request) {
  const who = await viewer(request);
  if (who instanceof Response) return who;
  if (limited(`opt:${who.owner}`, 20, 60_000)) {
    return json({ error: "Too many optimizations. Try again in a minute." }, 429);
  }
  const body = await readJson(request);
  if (body instanceof Response) return body;
  if (!body || typeof body !== "object") return json({ error: "Expected a route." }, 400);
  const raw = body as Record<string, unknown>;
  const plan = validatePlan(raw.plan);
  if (!plan) return json({ error: "Add a start time and at least one stop." }, 400);
  const lockOrder = raw.lockOrder === true;
  const nowSec = typeof raw.nowSec === "number" && Number.isFinite(raw.nowSec) ? Math.round(raw.nowSec) : null;

  const warnings: string[] = [];
  const start = await locate(plan.startAddress, plan.startLat, plan.startLng).catch(() => null);
  if (!start) return json({ error: "Set a start address before optimizing." }, 422);

  let end: Point | null = null;
  if (plan.roundTrip) end = { ...start };
  else if (plan.endAddress || (plan.endLat != null && plan.endLng != null)) {
    end = await locate(plan.endAddress, plan.endLat, plan.endLng, start).catch(() => null);
    if (!end) warnings.push("The finish address could not be found, so the route ends at the last stop.");
  }

  const resolvedStops: Record<string, { lat: number; lng: number }> = {};
  const located: Stop[] = [];
  for (const stop of plan.stops) {
    if (stop.status === "skipped") continue;
    const point = await locate(stop.address, stop.lat, stop.lng, start).catch(() => null);
    if (!point) {
      warnings.push(`Couldn't find ${stop.clientName || stop.address || "a stop"}.`);
      continue;
    }
    resolvedStops[stop.id] = { lat: point.lat, lng: point.lng };
    located.push({ ...stop, lat: point.lat, lng: point.lng });
  }

  const byId = new Map(located.map((stop) => [stop.id, stop]));
  const done = plan.sequence.map((id) => byId.get(id)).filter((stop): stop is Stop => stop?.status === "done");
  const pending = plan.sequence.map((id) => byId.get(id)).filter((stop): stop is Stop => stop?.status === "pending");
  for (const stop of located) {
    if (stop.status === "pending" && !pending.includes(stop)) pending.push(stop);
    if (stop.status === "done" && !done.includes(stop)) done.push(stop);
  }
  if (pending.length === 0) return json({ error: "Add a stop that still needs a visit." }, 422);

  const routeStartMin = parseClock(plan.startTime);
  if (routeStartMin == null) return json({ error: "Set a start time." }, 400);
  const lastDone = done[done.length - 1];
  const origin =
    lastDone?.lat != null && lastDone.lng != null
      ? { lat: lastDone.lat, lng: lastDone.lng }
      : { lat: start.lat, lng: start.lng };
  let startSec = routeStartMin * 60;
  if (lastDone && plan.result) {
    const event = plan.result.events.find((item) => item.id === lastDone.id);
    if (event) startSec = Math.max(startSec, event.departSec);
  }
  if (lastDone && nowSec != null) startSec = Math.max(startSec, Math.min(nowSec, startSec + 36 * 3600));

  const matrixPoints = [
    { id: START_ID, ...origin },
    ...pending
      .filter((stop) => stop.lat != null && stop.lng != null)
      .map((stop) => ({ id: stop.id, lat: stop.lat as number, lng: stop.lng as number })),
    ...(end ? [{ id: END_ID, lat: end.lat, lng: end.lng }] : []),
  ];
  const { matrix, routing } = await roadMatrix(matrixPoints);
  const travel = matrixFromJson(matrix);
  const pendingOpt = pending.map((stop) => toOptStop(stop, routeStartMin));
  const breaks = plan.breaks
    .filter((item) => item.status === "pending")
    .map((item) => toOptBreak(item, routeStartMin))
    .filter((item): item is NonNullable<typeof item> => item != null);
  const enteredOrder = plan.sequence.filter((id) => pending.some((stop) => stop.id === id));
  const shared = {
    stops: pendingOpt,
    breaks,
    matrix: travel,
    startSec,
    hasEnd: end != null,
    endDeadlineSec: plan.endTime ? deadlineSec(plan.endTime, startSec) : null,
  };
  const entered = scheduleRoute({ ...shared, stopOrder: enteredOrder });
  const schedule = lockOrder ? entered : optimizeRoute(shared);

  const linePoints = [
    origin,
    ...schedule.stopOrder
      .map((id) => resolvedStops[id])
      .filter((point): point is { lat: number; lng: number } => point != null),
    ...(end ? [{ lat: end.lat, lng: end.lng }] : []),
  ];
  const geometry = routing === "road" ? await roadLine(linePoints) : linePoints.map((point) => [point.lat, point.lng] as [number, number]);

  const result: RoutePlan["result"] = {
    locked: lockOrder,
    routing,
    stopOrder: schedule.stopOrder,
    events: schedule.events,
    driveSec: schedule.driveSec,
    distanceM: schedule.distanceM,
    lateSec: schedule.lateSec,
    waitSec: schedule.waitSec,
    finishSec: schedule.finishSec,
    geometry,
    matrix,
    enteredDriveSec: lockOrder ? null : entered.driveSec,
    enteredLateSec: lockOrder ? null : entered.lateSec,
  };

  return json({
    resolved: {
      start: { lat: start.lat, lng: start.lng },
      end: end && !plan.roundTrip ? { lat: end.lat, lng: end.lng } : null,
      stops: resolvedStops,
    },
    result,
    warnings,
    routing,
  });
}
