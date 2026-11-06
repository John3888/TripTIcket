import assert from "node:assert/strict";
import { test } from "node:test";
import { advanceMotion, type MotionPoint, type MotionState } from "./gps.motion.js";
import { motionTrace } from "./gps.trace.js";

const point = (second: number, meters: number, speedKph = 0) => ({
  id: String(second), latitude: 10 + meters / 111320, longitude: 122, speedKph, accuracyMeters: 5,
  recordedAt: new Date(Date.UTC(2026, 10, 6, 0, 0, second)).toISOString(),
});

test("stationary drift never draws a web, even outside the old hold radius", () => {
  const points = Array.from({ length: 180 }, (_, i) => point(i, i ? Math.sin(i) * 150 : 0, i % 5 === 0 ? 1.8 : 0.2));
  const trace = motionTrace(points);
  assert.equal(trace.groups.length, 1); assert.equal(trace.groups[0]!.length, 1);
  assert.equal(trace.state!.anchor.latitude, 10); assert.equal(trace.state!.moving, false);
  assert.equal(points.length, 180);
});

test("three coherent movement fixes release the hold; stopping freezes the trail again", () => {
  const samples = [point(0, 0), point(1, 3, 10), point(2, 6, 10), point(3, 9, 10), point(4, 12, 10),
    point(5, 45), point(6, -30), point(7, 100, 12), point(8, 0)];
  const trace = motionTrace(samples);
  assert.equal(trace.groups[0]!.length, 3);
  assert.equal(trace.state!.anchor.id, "4"); assert.equal(trace.state!.moving, false);
});

test("inconsistent high-speed spikes cannot confirm movement; gaps stay disconnected", () => {
  const trace = motionTrace([point(0, 0), point(1, 20, 10), point(2, 1, 10), point(3, 22, 10), point(70, 100)]);
  assert.deepEqual(trace.groups.map((group) => group.length), [1, 1]);
});

test("missing speed needs coherent geometry and cannot turn a small jitter cloud into movement", () => {
  let state: MotionState<MotionPoint> | undefined;
  let vertices = 0;
  for (let i = 0; i < 100; i++) {
    const next = advanceMotion(state, { ...point(i, Math.sin(i) * 4), speedKph: null });
    state = next.state; if (next.vertex) vertices++;
  }
  assert.equal(vertices, 1);
});

test("walking profile discards the false 37 km/h excursion and does not draw connectors over rejected fixes", () => {
  const trace = motionTrace([point(0, 0), point(1, 12, 37), point(2, 25, 37), point(3, 38, 37), point(4, 0)], 10);
  assert.equal(trace.groups.length, 1); assert.equal(trace.groups[0]!.length, 1);
  assert.equal(trace.state!.anchor.latitude, 10); assert.equal(trace.lastTrusted!.id, "4");
  assert.equal(motionTrace([{ ...point(0, 0), accuracyMeters: 120 }]).groups.length, 0);
});
