import { parseTime } from './time';

export interface TimeWindow {
  /** Minutes from midnight. Null means no limit. */
  start: number | null;
  end: number | null;
}

export interface RoutePlan {
  /** Client indexes in visit order. */
  order: number[];
  /** Arrival minute for each client, aligned with `order`. */
  arrival: number[];
  /** Minutes late against the end of the window. */
  late: number[];
  /** Drive minutes into each client. */
  travel: number[];
}

interface State {
  late: number;
  travel: number;
  time: number;
}

function better(a: State, b: State): boolean {
  if (a.late !== b.late) return a.late < b.late;
  if (a.travel !== b.travel) return a.travel < b.travel;
  return a.time < b.time;
}

function arrive(departReady: number, drive: number, window: TimeWindow): { arrival: number; late: number; leave: number } {
  let arrival = departReady + drive;
  if (window.start != null && arrival < window.start) arrival = window.start;
  const late = window.end != null && arrival > window.end ? arrival - window.end : 0;
  return { arrival, late, leave: arrival };
}

/**
 * Order client stops after a start point.
 * `durationMin[0]` is the start. Clients are indexes 1..n.
 * Prefers an order that arrives inside each time window, then the shortest drive.
 */
export function optimiseRoute(durationMin: number[][], windows: TimeWindow[], depart: number, serviceMin: number[]): RoutePlan {
  const count = windows.length;
  if (count === 0) return { order: [], arrival: [], late: [], travel: [] };
  if (count > 16) return greedy(durationMin, windows, depart, serviceMin);

  const size = 1 << count;
  const dp: (State | undefined)[][] = Array.from({ length: size }, () => Array(count));
  const parentMask = Array.from({ length: size }, () => Array<number>(count).fill(-1));
  const parentLast = Array.from({ length: size }, () => Array<number>(count).fill(-1));

  for (let i = 0; i < count; i++) {
    const drive = durationMin[0][i + 1];
    const step = arrive(depart, drive, windows[i]);
    dp[1 << i][i] = { late: step.late, travel: drive, time: step.arrival + serviceMin[i] };
  }

  for (let mask = 1; mask < size; mask++) {
    for (let last = 0; last < count; last++) {
      const state = dp[mask][last];
      if (!state || (mask & (1 << last)) === 0) continue;
      for (let next = 0; next < count; next++) {
        if (mask & (1 << next)) continue;
        const drive = durationMin[last + 1][next + 1];
        const step = arrive(state.time, drive, windows[next]);
        const candidate: State = { late: state.late + step.late, travel: state.travel + drive, time: step.arrival + serviceMin[next] };
        const nextMask = mask | (1 << next);
        const existing = dp[nextMask][next];
        if (!existing || better(candidate, existing)) {
          dp[nextMask][next] = candidate;
          parentMask[nextMask][next] = mask;
          parentLast[nextMask][next] = last;
        }
      }
    }
  }

  const full = size - 1;
  let bestLast = 0;
  for (let last = 1; last < count; last++) {
    const state = dp[full][last];
    const best = dp[full][bestLast];
    if (state && (!best || better(state, best))) bestLast = last;
  }

  const order: number[] = [];
  let mask = full;
  let last = bestLast;
  while (last >= 0) {
    order.push(last);
    const previousMask = parentMask[mask][last];
    const previousLast = parentLast[mask][last];
    mask = previousMask;
    last = previousLast;
  }
  order.reverse();
  return trace(order, durationMin, windows, depart, serviceMin);
}

function greedy(durationMin: number[][], windows: TimeWindow[], depart: number, serviceMin: number[]): RoutePlan {
  const remaining = windows.map((_, index) => index);
  const order: number[] = [];
  let node = 0;
  let time = depart;
  while (remaining.length) {
    let pick = remaining[0];
    let pickScore = Number.POSITIVE_INFINITY;
    for (const index of remaining) {
      const drive = durationMin[node][index + 1];
      const step = arrive(time, drive, windows[index]);
      const urgency = windows[index].end ?? 24 * 60;
      const score = step.late * 10_000 + urgency * 100 + drive;
      if (score < pickScore) {
        pick = index;
        pickScore = score;
      }
    }
    order.push(pick);
    const drive = durationMin[node][pick + 1];
    const step = arrive(time, drive, windows[pick]);
    time = step.arrival + serviceMin[pick];
    node = pick + 1;
    remaining.splice(remaining.indexOf(pick), 1);
  }
  return trace(order, durationMin, windows, depart, serviceMin);
}

function trace(order: number[], durationMin: number[][], windows: TimeWindow[], depart: number, serviceMin: number[]): RoutePlan {
  const arrival: number[] = [];
  const late: number[] = [];
  const travel: number[] = [];
  let node = 0;
  let time = depart;
  for (const index of order) {
    const drive = durationMin[node][index + 1];
    const step = arrive(time, drive, windows[index]);
    travel.push(drive);
    arrival.push(step.arrival);
    late.push(step.late);
    time = step.arrival + serviceMin[index];
    node = index + 1;
  }
  return { order, arrival, late, travel };
}

export function windowFrom(start: string, end: string): TimeWindow {
  return { start: parseTime(start), end: parseTime(end) };
}
