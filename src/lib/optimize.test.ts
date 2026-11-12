import assert from "node:assert/strict";
import test from "node:test";
import { alignWindow, optimizeRoute, scheduleRoute, type TravelMatrix } from "./optimize";
import { parseStopLines } from "./parseStops";

function lineMatrix(coords: Record<string, number>): TravelMatrix {
  const seconds = (from: string, to: string) => Math.abs(coords[from] - coords[to]) * 60;
  return { seconds, meters: (from, to) => Math.abs(coords[from] - coords[to]) * 100 };
}

const open = { windowStartSec: null, windowEndSec: null, serviceSec: 0, order: "auto" as const };

test("visits a straight line in order and returns home", () => {
  const matrix = lineMatrix({ start: 0, a: 1, b: 2, c: 3, end: 0 });
  const schedule = optimizeRoute({
    stops: [
      { ...open, id: "c" },
      { ...open, id: "a" },
      { ...open, id: "b" },
    ],
    breaks: [],
    matrix,
    startSec: 8 * 3600,
    hasEnd: true,
    endDeadlineSec: null,
  });
  assert.deepEqual(schedule.stopOrder, ["a", "b", "c"]);
  assert.equal(schedule.driveSec, 6 * 60);
  assert.equal(schedule.lateSec, 0);
});

test("an early window pulls a farther stop forward", () => {
  const minutes: Record<string, Record<string, number>> = {
    start: { start: 0, near: 8, far: 10, end: 0 },
    near: { start: 8, near: 0, far: 20, end: 8 },
    far: { start: 10, near: 20, far: 0, end: 10 },
    end: { start: 0, near: 8, far: 10, end: 0 },
  };
  const matrix: TravelMatrix = {
    seconds: (from, to) => minutes[from][to] * 60,
    meters: (from, to) => minutes[from][to] * 100,
  };
  const schedule = optimizeRoute({
    stops: [
      { ...open, id: "near" },
      { ...open, id: "far", windowEndSec: 8 * 3600 + 12 * 60 },
    ],
    breaks: [],
    matrix,
    startSec: 8 * 3600,
    hasEnd: false,
    endDeadlineSec: null,
  });
  assert.deepEqual(schedule.stopOrder, ["far", "near"]);
  assert.equal(schedule.lateSec, 0);
});

test("a stop marked last stays at the end", () => {
  const matrix = lineMatrix({ start: 0, close: 1, far: 5, end: 0 });
  const schedule = optimizeRoute({
    stops: [
      { ...open, id: "close", order: "last" },
      { ...open, id: "far" },
    ],
    breaks: [],
    matrix,
    startSec: 8 * 3600,
    hasEnd: false,
    endDeadlineSec: null,
  });
  assert.deepEqual(schedule.stopOrder, ["far", "close"]);
});

test("a break adds its duration inside the window", () => {
  const matrix = lineMatrix({ start: 0, a: 1, end: 0 });
  const schedule = optimizeRoute({
    stops: [{ ...open, id: "a" }],
    breaks: [{ id: "lunch", durationSec: 30 * 60, windowStartSec: 8 * 3600, windowEndSec: 9 * 3600 }],
    matrix,
    startSec: 8 * 3600,
    hasEnd: false,
    endDeadlineSec: null,
  });
  assert.equal(schedule.events.some((event) => event.kind === "break"), true);
  assert.equal(schedule.finishSec, 8 * 3600 + 31 * 60);
  assert.equal(schedule.lateSec, 0);
});

test("locked order is preserved and a missed window is reported", () => {
  const matrix = lineMatrix({ start: 0, a: 30, end: 0 });
  const schedule = scheduleRoute({
    stopOrder: ["a"],
    stops: [{ ...open, id: "a", windowEndSec: 8 * 3600 + 5 * 60 }],
    breaks: [],
    matrix,
    startSec: 8 * 3600,
    hasEnd: false,
    endDeadlineSec: null,
  });
  assert.deepEqual(schedule.stopOrder, ["a"]);
  assert.equal(schedule.lateSec, 25 * 60);
});

test("windows before the start roll onto the next morning", () => {
  const aligned = alignWindow(23 * 60, 60, 22 * 60);
  assert.deepEqual(aligned, { start: 23 * 60, end: 25 * 60 });
});

test("pasted lines pick up name, address, and phone", () => {
  const parsed = parseStopLines(
    "Ana Ruiz, 1355 Market Street San Francisco, 415-555-0176, Gate code\n900 North Point St, San Francisco\n",
  );
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].clientName, "Ana Ruiz");
  assert.equal(parsed[0].phone, "415-555-0176");
  assert.equal(parsed[0].notes, "Gate code");
  assert.equal(parsed[1].address, "900 North Point St, San Francisco");
});
