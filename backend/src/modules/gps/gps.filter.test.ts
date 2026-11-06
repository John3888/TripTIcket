import assert from "node:assert/strict";
import { test } from "node:test";
import { filterFix } from "./gps.filter.js";
import { cleanTrace, observed } from "./gps.trace.js";

const fix = (seconds: number, latitude = 10, accuracyMeters = 5) => ({
  latitude, longitude: 122, accuracyMeters, speedKph: 0,
  recordedAt: new Date(Date.UTC(2026, 10, 6, 0, 0, seconds)),
});

test("Kalman suppresses stopped-device drift, releases on motion and accepts weak quality", () => {
  const first = filterFix(fix(0)).state!;
  const next = filterFix(fix(1, 10.00001), first).state!;
  assert.equal(next.latitude, first.latitude);
  const moving = filterFix({ ...fix(2, 10.00002), motion: "moving", speedKph: 5 }, next).state!;
  assert.ok(moving.latitude > first.latitude && moving.latitude < 10.00002);
  assert.ok(filterFix(fix(3, 10.00002, 25), moving).state);
  const spike = filterFix({ ...fix(3, 11), motion: "moving", speedKph: 5 }, next);
  assert.equal(spike.reason, "implausible_jump"); assert.equal(spike.state, null);
});

test("known bad quality and walking-profile vehicle speeds cannot become map positions", () => {
  assert.equal(filterFix({ ...fix(0), hdop: 24 }).reason, "poor_hdop");
  assert.equal(filterFix({ ...fix(0), satellites: 3 }).reason, "poor_satellites");
  assert.equal(filterFix({ ...fix(0), speedKph: 37.7 }, null, 10).reason, "implausible_speed");
  assert.ok(filterFix({ ...fix(0), speedKph: 37.7 }, null, 200).state);
  assert.equal(filterFix({ ...fix(0), gnssFixOk: false }).reason, "invalid_gnss_fix");
  assert.equal(filterFix({ ...fix(0), speedAccuracyKph: 7 }).reason, "poor_speed_accuracy");
  assert.equal(filterFix(fix(0, 10, 80)).reason, "poor_accuracy");
});

test("MPU-confirmed stationary samples hold a 35m drift cloud without losing readings", () => {
  let state = filterFix(fix(0)).state!;
  for (let second = 1; second <= 120; second++) {
    const result = filterFix({ ...fix(second, 10 + Math.sin(second) * 0.0003), motion: "stationary" }, state);
    assert.equal(result.reason, "stationary");
    assert.equal(result.state!.latitude, 10);
    state = result.state!;
  }
});

test("invalid coordinates and duplicate times cannot alter filter state; gaps reacquire immediately", () => {
  const first = filterFix(fix(0)).state!;
  assert.equal(filterFix(fix(0), first).reason, "out_of_order");
  assert.equal(filterFix(fix(1, NaN), first).state, null);
  assert.equal(filterFix(fix(90, 11), first).state?.latitude, 11);
  const edge = { ...first, longitude: 179.9999 };
  const result = filterFix({ ...fix(1), longitude: -179.9999 }, edge).state!;
  assert.ok(Math.abs(result.longitude) > 179.99);
});

test("stationary readings remain stored but collapse to one displayed trail anchor", () => {
  const points = [0, 1, 2, 3].map((second) => ({
    id: String(second), latitude: second < 2 ? 10 : 10.000001,
    longitude: 122, recordedAt: fix(second).recordedAt.toISOString(), accuracyMeters: 5, speedKph: 0,
  }));
  const groups = cleanTrace(points);
  assert.equal(groups.length, 1);
  assert.deepEqual(observed(groups[0]!).coordinates, [[122, 10]]);
  assert.equal(observed(groups[0]!).estimated, false);
  const afterGap = { ...points[0]!, id: "gap", recordedAt: fix(90).recordedAt.toISOString() };
  assert.deepEqual(cleanTrace([...points, afterGap]).map((g) => g.length), [1, 1]);
});
