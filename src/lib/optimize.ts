import type { MatrixJson, OrderPref } from "./types";

export const START_ID = "start";
export const END_ID = "end";

export type OptStop = {
  id: string;
  serviceSec: number;
  windowStartSec: number | null;
  windowEndSec: number | null;
  order: OrderPref;
};

export type OptBreak = {
  id: string;
  durationSec: number;
  windowStartSec: number;
  windowEndSec: number;
};

export type TravelMatrix = {
  seconds: (from: string, to: string) => number;
  meters: (from: string, to: string) => number;
};

export type SchedEvent = {
  id: string;
  kind: "stop" | "break";
  etaSec: number;
  departSec: number;
  driveSec: number;
  distanceM: number;
  waitSec: number;
  lateSec: number;
};

export type Schedule = {
  events: SchedEvent[];
  driveSec: number;
  distanceM: number;
  lateSec: number;
  waitSec: number;
  finishSec: number;
  stopOrder: string[];
};

type Event = { kind: "stop" | "break"; id: string };

type Score = [number, number, number];

function finite(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value < 0) return fallback;
  return Math.round(value);
}

function better(a: Score, b: Score): boolean {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

function scoreOf(schedule: Schedule): Score {
  // Honor arrival windows first, then finish earlier (so the day does not sit through a long wait), then drive less.
  return [schedule.lateSec, schedule.finishSec, schedule.driveSec];
}

export function matrixFromJson(json: MatrixJson): TravelMatrix {
  const index = new Map(json.ids.map((id, i) => [id, i]));
  const cell = (table: number[][], from: string, to: string) => {
    const i = index.get(from);
    const j = index.get(to);
    if (i == null || j == null) return Number.NaN;
    return table[i]?.[j] ?? Number.NaN;
  };
  return {
    seconds: (from, to) => finite(cell(json.seconds, from, to), 8 * 3600),
    meters: (from, to) => finite(cell(json.meters, from, to), 0),
  };
}

function scheduleEvents(
  events: Event[],
  args: {
    stops: Map<string, OptStop>;
    breaks: Map<string, OptBreak>;
    matrix: TravelMatrix;
    startId: string;
    startSec: number;
    hasEnd: boolean;
    endDeadlineSec: number | null;
  },
): Schedule {
  let loc = args.startId;
  let time = args.startSec;
  const out: SchedEvent[] = [];
  let driveSec = 0;
  let distanceM = 0;
  let lateSec = 0;
  let waitSec = 0;
  const stopOrder: string[] = [];

  for (const event of events) {
    if (event.kind === "break") {
      const item = args.breaks.get(event.id);
      if (!item) continue;
      const wait = Math.max(0, item.windowStartSec - time);
      const eta = time + wait;
      const late = Math.max(0, eta - item.windowEndSec);
      time = eta + item.durationSec;
      waitSec += wait;
      lateSec += late;
      out.push({
        id: event.id,
        kind: "break",
        etaSec: eta,
        departSec: time,
        driveSec: 0,
        distanceM: 0,
        waitSec: wait,
        lateSec: late,
      });
      continue;
    }
    const stop = args.stops.get(event.id);
    if (!stop) continue;
    const legSec = args.matrix.seconds(loc, event.id);
    const legM = args.matrix.meters(loc, event.id);
    driveSec += legSec;
    distanceM += legM;
    time += legSec;
    const wait = stop.windowStartSec != null ? Math.max(0, stop.windowStartSec - time) : 0;
    time += wait;
    const late = stop.windowEndSec != null ? Math.max(0, time - stop.windowEndSec) : 0;
    const eta = time;
    time += stop.serviceSec;
    waitSec += wait;
    lateSec += late;
    loc = event.id;
    stopOrder.push(event.id);
    out.push({
      id: event.id,
      kind: "stop",
      etaSec: eta,
      departSec: time,
      driveSec: legSec,
      distanceM: legM,
      waitSec: wait,
      lateSec: late,
    });
  }

  if (args.hasEnd) {
    const legSec = args.matrix.seconds(loc, END_ID);
    const legM = args.matrix.meters(loc, END_ID);
    driveSec += legSec;
    distanceM += legM;
    time += legSec;
    if (args.endDeadlineSec != null) lateSec += Math.max(0, time - args.endDeadlineSec);
  }

  return { events: out, driveSec, distanceM, lateSec, waitSec, finishSec: time, stopOrder };
}

function withBreaks(stopIds: string[], placements: { gap: number; id: string }[]): Event[] {
  const byGap = new Map<number, string[]>();
  for (const placement of placements) {
    const list = byGap.get(placement.gap) ?? [];
    list.push(placement.id);
    byGap.set(placement.gap, list);
  }
  const events: Event[] = [];
  for (let gap = 0; gap <= stopIds.length; gap += 1) {
    for (const id of byGap.get(gap) ?? []) events.push({ kind: "break", id });
    if (gap < stopIds.length) events.push({ kind: "stop", id: stopIds[gap] });
  }
  return events;
}

function placeBreaks(
  stopIds: string[],
  breaks: OptBreak[],
  base: Omit<Parameters<typeof scheduleEvents>[1], never>,
  exact: boolean,
): Schedule {
  if (breaks.length === 0) {
    return scheduleEvents(
      stopIds.map((id) => ({ kind: "stop", id })),
      base,
    );
  }
  const consider = (events: Event[], best: { schedule: Schedule; score: Score } | null) => {
    const schedule = scheduleEvents(events, base);
    const score = scoreOf(schedule);
    if (!best || better(score, best.score)) return { schedule, score };
    return best;
  };

  if (exact && breaks.length <= 2) {
    let best: { schedule: Schedule; score: Score } | null = null;
    const orders =
      breaks.length === 1
        ? [breaks]
        : [
            [breaks[0], breaks[1]],
            [breaks[1], breaks[0]],
          ];
    for (const order of orders) {
      if (order.length === 1) {
        for (let gap = 0; gap <= stopIds.length; gap += 1) {
          best = consider(withBreaks(stopIds, [{ gap, id: order[0].id }]), best);
        }
      } else {
        for (let first = 0; first <= stopIds.length; first += 1) {
          for (let second = first; second <= stopIds.length; second += 1) {
            best = consider(
              withBreaks(stopIds, [
                { gap: first, id: order[0].id },
                { gap: second, id: order[1].id },
              ]),
              best,
            );
          }
        }
      }
    }
    return best?.schedule ?? scheduleEvents([], base);
  }

  let events: Event[] = stopIds.map((id) => ({ kind: "stop", id }));
  const ordered = [...breaks].sort(
    (a, b) => a.windowStartSec - b.windowStartSec || a.id.localeCompare(b.id),
  );
  for (const item of ordered) {
    let bestEvents = events;
    let bestScore: Score | null = null;
    for (let index = 0; index <= events.length; index += 1) {
      const candidate = events.slice();
      candidate.splice(index, 0, { kind: "break", id: item.id });
      const schedule = scheduleEvents(candidate, base);
      const score = scoreOf(schedule);
      if (!bestScore || better(score, bestScore)) {
        bestScore = score;
        bestEvents = candidate;
      }
    }
    events = bestEvents;
  }
  return scheduleEvents(events, base);
}

function nearest(ids: string[], startLoc: string, matrix: TravelMatrix): string[] {
  const left = [...ids];
  const out: string[] = [];
  let loc = startLoc;
  while (left.length > 0) {
    let best = 0;
    let bestSec = Infinity;
    for (let i = 0; i < left.length; i += 1) {
      const sec = matrix.seconds(loc, left[i]);
      if (sec < bestSec || (sec === bestSec && left[i] < left[best])) {
        bestSec = sec;
        best = i;
      }
    }
    const id = left.splice(best, 1)[0];
    out.push(id);
    loc = id;
  }
  return out;
}

function windowGreedy(
  group: OptStop[],
  startLoc: string,
  startTime: number,
  matrix: TravelMatrix,
): string[] {
  const left = new Map(group.map((stop) => [stop.id, stop]));
  const out: string[] = [];
  let loc = startLoc;
  let time = startTime;
  while (left.size > 0) {
    let bestId = "";
    let bestKey: Score | null = null;
    for (const stop of left.values()) {
      const travel = matrix.seconds(loc, stop.id);
      let arrive = time + travel;
      const wait = stop.windowStartSec != null ? Math.max(0, stop.windowStartSec - arrive) : 0;
      arrive += wait;
      const late = stop.windowEndSec != null ? Math.max(0, arrive - stop.windowEndSec) : 0;
      const key: Score = [late, travel, wait];
      if (
        !bestKey ||
        better(key, bestKey) ||
        (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] === bestKey[2] && stop.id < bestId)
      ) {
        bestKey = key;
        bestId = stop.id;
      }
    }
    const chosen = left.get(bestId);
    if (!chosen) break;
    time += matrix.seconds(loc, bestId);
    if (chosen.windowStartSec != null && time < chosen.windowStartSec) time = chosen.windowStartSec;
    time += chosen.serviceSec;
    loc = bestId;
    left.delete(bestId);
    out.push(bestId);
  }
  return out;
}

function clockAfter(
  ids: string[],
  startLoc: string,
  startTime: number,
  stops: Map<string, OptStop>,
  matrix: TravelMatrix,
): { loc: string; time: number } {
  let loc = startLoc;
  let time = startTime;
  for (const id of ids) {
    const stop = stops.get(id);
    if (!stop) continue;
    time += matrix.seconds(loc, id);
    if (stop.windowStartSec != null && time < stop.windowStartSec) time = stop.windowStartSec;
    time += stop.serviceSec;
    loc = id;
  }
  return { loc, time };
}

function seedOrder(
  groups: OptStop[][],
  kind: "near" | "window",
  startId: string,
  startSec: number,
  stops: Map<string, OptStop>,
  matrix: TravelMatrix,
): string[] {
  let loc = startId;
  let time = startSec;
  const out: string[] = [];
  for (const group of groups) {
    if (group.length === 0) continue;
    const part =
      kind === "near"
        ? nearest(
            group.map((stop) => stop.id),
            loc,
            matrix,
          )
        : windowGreedy(group, loc, time, matrix);
    const next = clockAfter(part, loc, time, stops, matrix);
    loc = next.loc;
    time = next.time;
    out.push(...part);
  }
  return out;
}

function relocate(order: string[], from: number, to: number): string[] {
  if (from === to) return order.slice();
  const next = order.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function reverseRange(order: string[], start: number, end: number): string[] {
  const next = order.slice();
  let i = start;
  let k = end;
  while (i < k) {
    const tmp = next[i];
    next[i] = next[k];
    next[k] = tmp;
    i += 1;
    k -= 1;
  }
  return next;
}

function improve(
  order: string[],
  ranges: Array<[number, number]>,
  evaluate: (order: string[]) => Schedule,
): Schedule {
  let current = order;
  let currentSchedule = evaluate(current);
  let currentScore = scoreOf(currentSchedule);
  let evals = 0;
  let improved = true;
  while (improved && evals < 8000) {
    improved = false;
    for (const [lo, hi] of ranges) {
      for (let from = lo; from < hi; from += 1) {
        for (let to = lo; to < hi; to += 1) {
          if (from === to || evals >= 8000) continue;
          evals += 1;
          const next = relocate(current, from, to);
          const schedule = evaluate(next);
          const score = scoreOf(schedule);
          if (better(score, currentScore)) {
            current = next;
            currentSchedule = schedule;
            currentScore = score;
            improved = true;
          }
        }
      }
      for (let i = lo; i < hi; i += 1) {
        for (let k = i + 1; k < hi; k += 1) {
          if (evals >= 8000) break;
          evals += 1;
          const next = reverseRange(current, i, k);
          const schedule = evaluate(next);
          const score = scoreOf(schedule);
          if (better(score, currentScore)) {
            current = next;
            currentSchedule = schedule;
            currentScore = score;
            improved = true;
          }
        }
      }
    }
  }
  return currentSchedule;
}

export function scheduleRoute(args: {
  stopOrder: string[];
  stops: OptStop[];
  breaks: OptBreak[];
  matrix: TravelMatrix;
  startId?: string;
  startSec: number;
  hasEnd: boolean;
  endDeadlineSec: number | null;
}): Schedule {
  const stops = new Map(args.stops.map((stop) => [stop.id, stop]));
  const breaks = new Map(args.breaks.map((item) => [item.id, item]));
  const known = args.stopOrder.filter((id) => stops.has(id));
  return placeBreaks(
    known,
    args.breaks,
    {
      stops,
      breaks,
      matrix: args.matrix,
      startId: args.startId ?? START_ID,
      startSec: args.startSec,
      hasEnd: args.hasEnd,
      endDeadlineSec: args.endDeadlineSec,
    },
    true,
  );
}

export function optimizeRoute(args: {
  stops: OptStop[];
  breaks: OptBreak[];
  matrix: TravelMatrix;
  startSec: number;
  hasEnd: boolean;
  endDeadlineSec: number | null;
  lockOrder?: string[] | null;
}): Schedule {
  const stops = new Map(args.stops.map((stop) => [stop.id, stop]));
  const breaks = new Map(args.breaks.map((item) => [item.id, item]));
  const base = {
    stops,
    breaks,
    matrix: args.matrix,
    startId: START_ID,
    startSec: args.startSec,
    hasEnd: args.hasEnd,
    endDeadlineSec: args.endDeadlineSec,
  };
  if (args.lockOrder) {
    const locked = args.lockOrder.filter((id) => stops.has(id));
    return placeBreaks(locked, args.breaks, base, true);
  }

  const groups = [
    args.stops.filter((stop) => stop.order === "first"),
    args.stops.filter((stop) => stop.order === "auto"),
    args.stops.filter((stop) => stop.order === "last"),
  ];
  const ranges: Array<[number, number]> = [];
  let cursor = 0;
  for (const group of groups) {
    if (group.length > 1) ranges.push([cursor, cursor + group.length]);
    cursor += group.length;
  }
  const evaluate = (order: string[]) => placeBreaks(order, args.breaks, base, args.breaks.length <= 1);
  let best: Schedule | null = null;
  for (const kind of ["window", "near"] as const) {
    const seeded = seedOrder(groups, kind, START_ID, args.startSec, stops, args.matrix);
    const improved = ranges.length > 0 ? improve(seeded, ranges, evaluate) : evaluate(seeded);
    if (!best || better(scoreOf(improved), scoreOf(best))) best = improved;
  }
  if (!best) return scheduleEvents([], base);
  if (args.breaks.length > 1) return placeBreaks(best.stopOrder, args.breaks, base, true);
  return best;
}

/** Minutes-from-midnight window, shifted onto the route day when it falls before the start. */
export function alignWindow(
  start: number | null,
  end: number | null,
  routeStartMin: number,
): { start: number | null; end: number | null } {
  let windowStart = start;
  let windowEnd = end;
  if (windowStart != null && windowEnd != null && windowEnd <= windowStart) windowEnd += 24 * 60;
  const shift = (value: number | null) => {
    if (value == null) return null;
    return value + 6 * 60 < routeStartMin ? value + 24 * 60 : value;
  };
  windowStart = shift(windowStart);
  windowEnd = shift(windowEnd);
  if (windowStart != null && windowEnd != null && windowEnd <= windowStart) windowEnd += 24 * 60;
  return { start: windowStart, end: windowEnd };
}

export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}
