import {
  END_ID,
  START_ID,
  alignWindow,
  matrixFromJson,
  parseClock,
  scheduleRoute,
  type OptBreak,
  type OptStop,
} from "./optimize";
import type { RouteBreak, RoutePlan, Stop } from "./types";

export function windowsFor(
  mode: Stop["arrivalMode"],
  arriveAfter: string,
  arriveBefore: string,
  routeStartMin: number,
): { start: number | null; end: number | null } {
  const after = parseClock(arriveAfter);
  const before = parseClock(arriveBefore);
  let start: number | null = null;
  let end: number | null = null;
  if (mode === "before") end = before;
  else if (mode === "after") start = after;
  else if (mode === "between") {
    start = after;
    end = before;
  }
  const aligned = alignWindow(start, end, routeStartMin);
  return {
    start: aligned.start == null ? null : aligned.start * 60,
    end: aligned.end == null ? null : aligned.end * 60,
  };
}

export function toOptStop(stop: Stop, routeStartMin: number): OptStop {
  const window = windowsFor(stop.arrivalMode, stop.arriveAfter, stop.arriveBefore, routeStartMin);
  const serviceMin = Math.min(240, Math.max(0, Math.round(stop.serviceMin)));
  return {
    id: stop.id,
    serviceSec: serviceMin * 60,
    windowStartSec: window.start,
    windowEndSec: window.end,
    order: stop.order,
  };
}

export function toOptBreak(item: RouteBreak, routeStartMin: number): OptBreak | null {
  const start = parseClock(item.windowStart);
  const end = parseClock(item.windowEnd);
  if (start == null || end == null) return null;
  const aligned = alignWindow(start, end, routeStartMin);
  if (aligned.start == null || aligned.end == null) return null;
  const durationMin = Math.min(180, Math.max(1, Math.round(item.durationMin)));
  return {
    id: item.id,
    durationSec: durationMin * 60,
    windowStartSec: aligned.start * 60,
    windowEndSec: aligned.end * 60,
  };
}

export function routeStartSec(plan: Pick<RoutePlan, "startTime">): number | null {
  const minutes = parseClock(plan.startTime);
  if (minutes == null) return null;
  return minutes * 60;
}

export function reschedulePlan(plan: RoutePlan, nowSec: number): RoutePlan {
  if (!plan.result) return plan;
  const startMin = parseClock(plan.startTime);
  if (startMin == null) return plan;
  const pendingIds = plan.sequence.filter(
    (id) => plan.stops.find((stop) => stop.id === id)?.status === "pending",
  );
  if (pendingIds.some((id) => !plan.result?.matrix.ids.includes(id))) return plan;
  const doneIds = plan.sequence.filter((id) => plan.stops.find((stop) => stop.id === id)?.status === "done");
  const last = doneIds[doneIds.length - 1];
  const startId = last && plan.result.matrix.ids.includes(last) ? last : START_ID;
  let startSec = startMin * 60;
  if (last) {
    const event = plan.result.events.find((item) => item.id === last);
    startSec = Math.max(startSec, event?.departSec ?? startSec, nowSec);
  }
  const stops = pendingIds
    .map((id) => plan.stops.find((stop) => stop.id === id))
    .filter((stop): stop is Stop => stop != null)
    .map((stop) => toOptStop(stop, startMin));
  const breaks = plan.breaks
    .filter((item) => item.status === "pending")
    .map((item) => toOptBreak(item, startMin))
    .filter((item): item is OptBreak => item != null);
  let endDeadlineSec: number | null = null;
  if (plan.endTime) {
    const minutes = parseClock(plan.endTime);
    if (minutes != null) {
      endDeadlineSec = minutes * 60;
      if (endDeadlineSec + 6 * 3600 < startSec) endDeadlineSec += 24 * 3600;
    }
  }
  const schedule = scheduleRoute({
    stopOrder: pendingIds,
    stops,
    breaks,
    matrix: matrixFromJson(plan.result.matrix),
    startId,
    startSec,
    hasEnd: plan.result.matrix.ids.includes(END_ID),
    endDeadlineSec,
  });
  return {
    ...plan,
    result: {
      ...plan.result,
      locked: true,
      stopOrder: schedule.stopOrder,
      events: schedule.events,
      driveSec: schedule.driveSec,
      distanceM: schedule.distanceM,
      lateSec: schedule.lateSec,
      waitSec: schedule.waitSec,
      finishSec: schedule.finishSec,
    },
  };
}

export function blankStop(serviceMin: number): Stop {
  return {
    id: crypto.randomUUID(),
    clientName: "",
    address: "",
    lat: null,
    lng: null,
    phone: "",
    notes: "",
    reference: "",
    stopType: "delivery",
    order: "auto",
    arrivalMode: "anytime",
    arriveAfter: "",
    arriveBefore: "",
    serviceMin,
    status: "pending",
  };
}
