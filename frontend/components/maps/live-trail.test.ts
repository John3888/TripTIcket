import test from "node:test";
import assert from "node:assert/strict";
import type { GpsPoint, Ticket } from "../../types/trip-ticket";
import { applyHeartbeat, applyPosition, deviceActive, metersBetween, trailThreshold } from "./live-trail";

const start = Date.parse("2026-10-01T00:00:00Z");
const point = (id: number, metres: number, seconds = id, accuracyMeters = 5): GpsPoint => ({
  id: String(id), deviceId: "tracker", latitude: 10 + metres / 111195,
  longitude: 122, recordedAt: new Date(start + seconds * 1000).toISOString(), accuracyMeters,
});
const trip = (): Ticket => ({
  id: "trip", status: "ongoing", requestedBy: "Employee", plate: "ABC", destination: "Office", purpose: "Work",
  departure: new Date(start).toISOString(),
  device: { deviceId: "tracker", vehicleId: "vehicle", enabled: true, lastSeenAt: new Date(start).toISOString() },
});

test("accepted stationary positions move the marker without adding trail vertices", () => {
  const first = applyPosition(trip(), point(1, 0));
  const next = applyPosition(first, point(2, 10));
  assert.equal(next.gps?.id, "2");
  assert.equal(next.track?.trailLastPoint?.id, "1");
  assert.equal(next.track?.segments, first.track?.segments);
  const moved = applyPosition(next, point(3, 20));
  assert.equal(moved.track?.segments.length, 1);
  assert.equal(moved.track?.trailLastPoint?.id, "3");
  assert.ok(moved.track!.distanceMeters > 19);
});

test("trail threshold uses the uncertainty of both vertices", () => {
  const a = point(1, 0, 1, 25), b = point(2, 20, 2, 5);
  assert.equal(trailThreshold(a, b), 25);
  assert.ok(metersBetween(a, b) < 25);
  const next = applyPosition(applyPosition(trip(), a), b);
  assert.equal(next.track?.segments.length, 0);
});

test("pending, approved and completed trips never extend a live trail", () => {
  for (const status of ["pending", "approved", "completed"] as const) {
    const ticket = { ...trip(), status };
    assert.equal(applyPosition(ticket, point(1, 0)), ticket);
  }
});

test("duplicates, out of order and pre-departure events do not alter position", () => {
  const first = applyPosition(trip(), point(2, 0));
  assert.equal(applyPosition(first, point(2, 500)), first);
  assert.equal(applyPosition(first, point(1, 500)), first);
  const ticket = trip();
  assert.equal(applyPosition(ticket, point(1, 0, -1)), ticket);
});

test("long gaps start a fresh observed segment without a straight connector", () => {
  let ticket = applyPosition(applyPosition(trip(), point(1, 0)), point(2, 20));
  ticket = applyPosition(ticket, point(3, 1000, 120));
  ticket = applyPosition(ticket, point(4, 1020, 125));
  assert.equal(ticket.track?.segments.length, 2);
  assert.ok(ticket.track!.distanceMeters < 41);
});

test("heartbeat updates only the matching tracker and preserves geometry/position", () => {
  const ticket = applyPosition(trip(), point(1, 0));
  const event = { deviceId: "tracker", vehicleId: "vehicle", lastSeenAt: new Date(start + 60000).toISOString() };
  const next = applyHeartbeat(ticket, event);
  assert.equal(next.gps, ticket.gps);
  assert.equal(next.track, ticket.track);
  assert.equal(next.device?.lastSeenAt, event.lastSeenAt);
  assert.equal(applyHeartbeat(ticket, { ...event, deviceId: "other" }), ticket);
  assert.equal(applyHeartbeat(next, { ...event, lastSeenAt: new Date(start).toISOString() }), next);
  assert.equal(applyHeartbeat(ticket, { ...event, lastSeenAt: "invalid" }), ticket);
  const unassigned = { ...ticket, device: null, track: { ...ticket.track!, device: ticket.device } };
  assert.equal(applyHeartbeat(unassigned, event), unassigned);
});

test("parked heartbeat remains active, then becomes inactive without deleting position", () => {
  const ticket = applyPosition(trip(), point(1, 0));
  assert.equal(deviceActive(ticket.device, start + 60000), true);
  assert.equal(deviceActive(ticket.device, start + 180001), false);
  assert.equal(deviceActive({ ...ticket.device!, enabled: false }, start), false);
  assert.equal(ticket.gps?.id, "1");
});

test("recovery snapshot can replay newer deltas without duplicate trail distance", () => {
  const snapshot = applyPosition(applyPosition(trip(), point(1, 0)), point(2, 20));
  const recovered = applyPosition(applyPosition(snapshot, point(2, 20)), point(3, 40));
  assert.equal(recovered.track?.segments[0].coordinates.length, 3);
  assert.ok(recovered.track!.distanceMeters < 41);
});
