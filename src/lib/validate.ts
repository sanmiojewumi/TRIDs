import type { ArrivalMode, OrderPref, RouteBreak, RoutePlan, RouteResult, Stop, StopStatus, StopType } from "./types";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

function clip(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function coord(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function pair(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const latitude = coord(lat);
  const longitude = coord(lng);
  if (latitude == null || longitude == null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { lat: latitude, lng: longitude };
}

const stopTypes = ["delivery", "pickup", "service"] as const;
const orders = ["first", "auto", "last"] as const;
const arrivals = ["anytime", "before", "after", "between"] as const;
const statuses = ["pending", "done", "skipped"] as const;

export function validateStop(value: unknown): Stop | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string" || !ID.test(raw.id)) return null;
  const point = pair(raw.lat, raw.lng);
  const service = typeof raw.serviceMin === "number" && Number.isFinite(raw.serviceMin) ? raw.serviceMin : 5;
  return {
    id: raw.id,
    clientName: clip(raw.clientName, 80),
    address: clip(raw.address, 200),
    lat: point?.lat ?? null,
    lng: point?.lng ?? null,
    phone: clip(raw.phone, 40),
    notes: clip(raw.notes, 500),
    reference: clip(raw.reference, 80),
    stopType: oneOf<StopType>(raw.stopType, stopTypes, "delivery"),
    order: oneOf<OrderPref>(raw.order, orders, "auto"),
    arrivalMode: oneOf<ArrivalMode>(raw.arrivalMode, arrivals, "anytime"),
    arriveAfter: CLOCK.test(clip(raw.arriveAfter, 5)) ? clip(raw.arriveAfter, 5) : "",
    arriveBefore: CLOCK.test(clip(raw.arriveBefore, 5)) ? clip(raw.arriveBefore, 5) : "",
    serviceMin: Math.min(240, Math.max(0, Math.round(service))),
    status: oneOf<StopStatus>(raw.status, statuses, "pending"),
  };
}

export function validateBreak(value: unknown): RouteBreak | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string" || !ID.test(raw.id)) return null;
  const duration = typeof raw.durationMin === "number" && Number.isFinite(raw.durationMin) ? raw.durationMin : 30;
  const start = clip(raw.windowStart, 5);
  const end = clip(raw.windowEnd, 5);
  return {
    id: raw.id,
    label: clip(raw.label, 40) || "Break",
    windowStart: CLOCK.test(start) ? start : "12:00",
    windowEnd: CLOCK.test(end) ? end : "13:00",
    durationMin: Math.min(180, Math.max(1, Math.round(duration))),
    status: oneOf<StopStatus>(raw.status, statuses, "pending"),
  };
}

function validateResult(value: unknown): RouteResult | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!raw.matrix || typeof raw.matrix !== "object") return null;
  const matrix = raw.matrix as Record<string, unknown>;
  if (!Array.isArray(matrix.ids) || matrix.ids.length > 40) return null;
  if (!matrix.ids.every((id) => typeof id === "string" && id.length < 80)) return null;
  const size = matrix.ids.length;
  if (!square(matrix.seconds, size) || !square(matrix.meters, size)) return null;
  if (!Array.isArray(raw.events) || raw.events.length > 40) return null;
  const events: RouteResult["events"] = [];
  for (const event of raw.events) {
    if (!event || typeof event !== "object") return null;
    const item = event as Record<string, unknown>;
    if (typeof item.id !== "string" || item.id.length > 80) return null;
    if (item.kind !== "stop" && item.kind !== "break") return null;
    const nums = [item.etaSec, item.departSec, item.driveSec, item.distanceM, item.waitSec, item.lateSec];
    if (!nums.every((num) => typeof num === "number" && Number.isFinite(num) && num >= 0 && num < 1e8)) return null;
    events.push({
      id: item.id,
      kind: item.kind === "break" ? "break" : "stop",
      etaSec: item.etaSec as number,
      departSec: item.departSec as number,
      driveSec: item.driveSec as number,
      distanceM: item.distanceM as number,
      waitSec: item.waitSec as number,
      lateSec: item.lateSec as number,
    });
  }
  const geometry: [number, number][] = [];
  if (Array.isArray(raw.geometry)) {
    for (const point of raw.geometry.slice(0, 4000)) {
      if (!Array.isArray(point) || point.length < 2) continue;
      const lat = coord(point[0]);
      const lng = coord(point[1]);
      if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
      geometry.push([lat, lng]);
    }
  }
  const num = (key: string) => {
    const n = raw[key];
    return typeof n === "number" && Number.isFinite(n) && n >= 0 && n < 1e8 ? n : 0;
  };
  const nullable = (key: string) => {
    if (raw[key] == null) return null;
    const n = raw[key];
    return typeof n === "number" && Number.isFinite(n) && n >= 0 && n < 1e8 ? n : null;
  };
  return {
    locked: raw.locked === true,
    routing: raw.routing === "estimated" ? "estimated" : "road",
    stopOrder: Array.isArray(raw.stopOrder)
      ? raw.stopOrder.filter((id): id is string => typeof id === "string").slice(0, 30)
      : [],
    events,
    driveSec: num("driveSec"),
    distanceM: num("distanceM"),
    lateSec: num("lateSec"),
    waitSec: num("waitSec"),
    finishSec: num("finishSec"),
    geometry,
    matrix: {
      ids: matrix.ids as string[],
      seconds: matrix.seconds as number[][],
      meters: matrix.meters as number[][],
    },
    enteredDriveSec: nullable("enteredDriveSec"),
    enteredLateSec: nullable("enteredLateSec"),
  };
}

function square(value: unknown, size: number): value is number[][] {
  if (!Array.isArray(value) || value.length !== size) return false;
  return value.every(
    (row) =>
      Array.isArray(row) &&
      row.length === size &&
      row.every((cell) => typeof cell === "number" && Number.isFinite(cell) && cell >= 0 && cell < 1e8),
  );
}

export function validatePlan(value: unknown): RoutePlan | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string" || !ID.test(raw.id)) return null;
  const date = clip(raw.date, 10);
  if (!DATE.test(date)) return null;
  const startTime = clip(raw.startTime, 5);
  if (!CLOCK.test(startTime)) return null;
  const endTime = clip(raw.endTime, 5);
  const start = pair(raw.startLat, raw.startLng);
  const end = pair(raw.endLat, raw.endLng);
  if (!Array.isArray(raw.stops) || raw.stops.length > 30) return null;
  if (!Array.isArray(raw.breaks) || raw.breaks.length > 4) return null;
  const stops: Stop[] = [];
  for (const stop of raw.stops) {
    const parsed = validateStop(stop);
    if (!parsed) return null;
    stops.push(parsed);
  }
  const ids = new Set(stops.map((stop) => stop.id));
  if (ids.size !== stops.length) return null;
  const breaks: RouteBreak[] = [];
  for (const item of raw.breaks) {
    const parsed = validateBreak(item);
    if (!parsed) return null;
    if (ids.has(parsed.id)) return null;
    breaks.push(parsed);
    ids.add(parsed.id);
  }
  const sequence = Array.isArray(raw.sequence)
    ? raw.sequence.filter((id): id is string => typeof id === "string" && stops.some((stop) => stop.id === id))
    : [];
  for (const stop of stops) {
    if (!sequence.includes(stop.id)) sequence.push(stop.id);
  }
  const service =
    typeof raw.defaultServiceMin === "number" && Number.isFinite(raw.defaultServiceMin)
      ? raw.defaultServiceMin
      : 5;
  return {
    id: raw.id,
    name: clip(raw.name, 80) || "Route",
    date,
    startAddress: clip(raw.startAddress, 200),
    startLat: start?.lat ?? null,
    startLng: start?.lng ?? null,
    startTime,
    roundTrip: raw.roundTrip !== false,
    endAddress: clip(raw.endAddress, 200),
    endLat: end?.lat ?? null,
    endLng: end?.lng ?? null,
    endTime: CLOCK.test(endTime) ? endTime : "",
    defaultServiceMin: Math.min(240, Math.max(0, Math.round(service))),
    stops,
    breaks,
    sequence,
    result: raw.result == null ? null : validateResult(raw.result),
  };
}
