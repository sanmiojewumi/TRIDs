import assert from "node:assert/strict";
import test from "node:test";
import { satnavUrl } from "./format";
import { validatePlan } from "./validate";

test("satnav links stay on the official map hosts", () => {
  assert.equal(
    satnavUrl("google", 37.8, -122.4),
    "https://www.google.com/maps/dir/?api=1&destination=37.800000%2C-122.400000&travelmode=driving",
  );
  assert.equal(satnavUrl("waze", 37.8, -122.4), "https://waze.com/ul?ll=37.800000%2C-122.400000&navigate=yes");
  assert.equal(satnavUrl("apple", 37.8, -122.4), "https://maps.apple.com/?daddr=37.800000%2C-122.400000&dirflg=d");
});

test("a completed day is kept as a record", () => {
  const plan = validatePlan({
    id: "11111111-1111-4111-8111-111111111111",
    name: "Thursday route",
    date: "2026-11-12",
    startTime: "08:00",
    status: "completed",
    completedAt: "2026-11-12T20:15:00.000Z",
    stops: [],
    breaks: [],
    sequence: [],
  });
  assert.equal(plan?.status, "completed");
  assert.equal(plan?.completedAt, "2026-11-12T20:15:00.000Z");
});
