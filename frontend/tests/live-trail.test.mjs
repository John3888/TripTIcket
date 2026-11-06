import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../components/maps/live-trail.ts", import.meta.url), "utf8");
const evaluatedModule = { exports: {} };
const motionModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(await readFile(new URL("../components/maps/gps-motion.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: motionModule.exports });
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText, { exports: evaluatedModule.exports, require(name) { if (name === "./gps-motion") return motionModule.exports; return {
  hasValidCoordinates: (p) => !!p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude),
  latestGpsPoint: (a, b) => !a || Date.parse(b.recordedAt) > Date.parse(a.recordedAt) ? b : a,
}; } });
const { applyPosition, applyHeartbeat, deviceActive, restoreTrail, liveFleet } = evaluatedModule.exports;
const departure = "2026-11-06T00:00:00.000Z";
const point = (second, latitude = 10) => ({ id: String(second), latitude, longitude: 122, speedKph: 0,
  recordedAt: new Date(Date.parse(departure) + second * 1000).toISOString() });

test("completed vehicles remain as one last-known reference and a new trip takes over", () => {
  const ongoing = { id: "new", plate: "ABC", status: "ongoing", flagged: true };
  const completed = { id: "old", plate: "ABC", status: "completed", gps: point(0) };
  assert.equal(liveFleet([completed, ongoing, { id: "approved", status: "approved" }]).length, 1);
  const active = liveFleet([completed, ongoing])[0];
  assert.equal(active.id, ongoing.id); assert.equal(active.gps.id, "0"); assert.equal(active.track, undefined);
  assert.equal(liveFleet([completed])[0], completed);
  assert.equal(liveFleet([{ ...ongoing, status: "completed" }]).length, 0);
  const newer = { ...completed, id: "newer", gps: point(2) };
  assert.equal(liveFleet([completed, newer])[0], newer);
  const afterFirstFix = { ...ongoing, gps: point(3) };
  assert.equal(liveFleet([completed, afterFirstFix])[0], afterFirstFix);
});

test("device presence is active while coordinates are unavailable and expires without keepalives", () => {
  const trip = { id: "1", status: "ongoing", departure, gps: null,
    device: { deviceId: "GPS-1", vehicleId: "CAR-1", enabled: true, lastSeenAt: null } };
  const heartbeat = { deviceId: "GPS-1", vehicleId: "CAR-1", lastSeenAt: departure };
  const updated = applyHeartbeat(trip, heartbeat);
  assert.equal(updated.gps, null);
  assert.equal(deviceActive(updated.device, Date.parse(departure)), true);
  assert.equal(deviceActive(updated.device, Date.parse(departure) + 180001), false);
  assert.equal(deviceActive({ ...updated.device, enabled: false }, Date.parse(departure)), false);
});

test("store snapshots restore a visible trail before history loads, including completed trips", () => {
  const trip = { id: "1", status: "ongoing", departure, gps: point(3), gpsTrail: [point(0), point(1), point(2), point(3)] };
  const restored = restoreTrail(trip);
  assert.equal(restored.track.sampleCount, 4);
  assert.equal(restored.track.segments[0].coordinates.length, 1);
  assert.equal(restored.gps.id, "3");
  const extended = restoreTrail({ ...restored, gps: point(4), gpsTrail: [...trip.gpsTrail, point(4)] });
  assert.equal(extended.track.sampleCount, 5);
  assert.equal(extended.track.segments.length, 1);
  const closed = restoreTrail({ ...trip, status: "completed", arrival: point(2).recordedAt });
  assert.equal(closed.status, "completed"); assert.equal(closed.track.sampleCount, 3);
});

test("trail starts at official departure, retains each fix, and stops on completion", () => {
  const trip = { id: "1", status: "ongoing", departure };
  assert.equal(applyPosition({ ...trip, status: "approved" }, point(1)).track, undefined);
  assert.equal(applyPosition(trip, point(-1)), trip);
  let current = applyPosition(trip, point(0));
  current = applyPosition(current, point(1));
  current = applyPosition(current, point(2, 10.000001));
  assert.equal(current.track.sampleCount, 3);
  assert.equal(current.track.segments[0].coordinates.length, 1);
  assert.equal(current.gps.latitude, 10);
  assert.equal(applyPosition(current, point(2)), current);
  const completed = { ...current, status: "completed", arrival: point(3).recordedAt };
  assert.equal(applyPosition(completed, point(4)), completed);
});

test("live trail splits gaps and appends to restored history without thinning readings", () => {
  let trip = applyPosition({ id: "1", status: "ongoing", departure }, point(0));
  trip.track.segments[0].live = false;
  trip = applyPosition(trip, point(1));
  assert.equal(trip.track.segments.length, 1);
  trip = applyPosition(trip, point(90));
  assert.equal(trip.track.segments.length, 2);
  assert.equal(trip.track.segments[1].coordinates.length, 1);
  trip = applyPosition(trip, point(91));
  assert.equal(trip.track.segments[1].coordinates.length, 1);
  assert.equal(trip.track.estimatedDistanceMeters, 0);
});

test("stationary drift freezes marker and trail; coherent movement releases both", () => {
  let trip = applyPosition({ id: "1", status: "ongoing", departure }, point(0));
  for (let i = 1; i <= 30; i++) trip = applyPosition(trip, point(i, 10 + Math.sin(i) * 0.001));
  assert.equal(trip.track.segments[0].coordinates.length, 1); assert.equal(trip.gps.latitude, 10);
  for (let i = 1; i <= 3; i++) trip = applyPosition(trip, { ...point(30 + i, 10 + i * 3 / 111320), speedKph: 10 });
  assert.equal(trip.track.segments[0].coordinates.length, 2);
  assert.equal(trip.track.moving, true); assert.ok(trip.gps.latitude > 10);
  const anchor = trip.gps.latitude;
  trip = applyPosition(trip, point(34, 10.001)); trip = applyPosition(trip, point(35, 9.999));
  assert.equal(trip.gps.latitude, anchor); assert.equal(trip.track.moving, false);
  assert.equal(trip.track.segments[0].coordinates.length, 2);
});

test("walking profile never restores high-speed false excursions from saved history", () => {
  const samples = [point(0), ...[1, 2, 3].map((i) => ({ ...point(i, 10 + i * 0.001), speedKph: 37 }))];
  const restored = restoreTrail({ id: "1", status: "ongoing", departure, gpsMaxSpeedKph: 10, gps: samples[3], gpsTrail: samples });
  assert.equal(restored.gps.latitude, 10); assert.equal(restored.track.segments[0].coordinates.length, 1);
  const none = restoreTrail({ id: "2", status: "ongoing", departure, gpsMaxSpeedKph: 10, gps: samples[3], gpsTrail: samples.slice(1) });
  assert.equal(none.gps, null);
});
