import assert from "node:assert/strict";
import { test } from "node:test";
import { elapsedTravelSeconds, tripTiming } from "./request.timing.js";

const departure = new Date("2026-09-07T08:00:00Z");
const request = {
  status: "ONGOING",
  departedAt: departure,
  arrivedAt: null,
  elapsedSeconds: 0,
};

test("Travel time starts at departure and is calculated without database counter updates", () => {
  assert.equal(elapsedTravelSeconds(request, departure), 0);
  assert.equal(elapsedTravelSeconds(request, new Date("2026-09-07T08:01:05Z")), 65);
  assert.equal(elapsedTravelSeconds(request, new Date("2026-09-08T09:02:03Z")), 90123);
  assert.equal(request.elapsedSeconds, 0);
});

test("Approval waiting time is not counted", () => {
  for (const status of ["PENDING", "NOTED", "APPROVED", "DENIED"]) {
    assert.equal(elapsedTravelSeconds({ ...request, status }), 0);
  }
});

test("Arrival freezes actual travel time regardless of when a record is viewed", () => {
  const completed = { ...request, status: "COMPLETED", arrivedAt: new Date("2026-09-07T09:12:34Z") };
  assert.equal(elapsedTravelSeconds(completed, new Date("2026-09-07T10:00:00Z")), 4354);
  assert.equal(elapsedTravelSeconds(completed, new Date("2026-10-01T00:00:00Z")), 4354);
  assert.equal(tripTiming(completed).arrival, "2026-09-07T09:12:34.000Z");
});

test("Old completed records use their saved duration if timestamps are missing", () => {
  assert.equal(elapsedTravelSeconds({ ...request, status: "COMPLETED", elapsedSeconds: 123 }), 123);
  assert.equal(elapsedTravelSeconds({ ...request, departedAt: null, elapsedSeconds: 45 }), 45);
  assert.equal(elapsedTravelSeconds(request, new Date("2026-09-07T07:59:00Z")), 0);
});

test("Trips are flagged only after exceeding the approved estimate, measured from departure", () => {
  const timed = { ...request, estimatedSeconds: 3600, flagged: false };
  assert.equal(tripTiming(timed, new Date("2026-09-07T08:59:59Z")).flagged, false);
  assert.equal(tripTiming(timed, new Date("2026-09-07T09:00:00Z")).flagged, false);
  const late = tripTiming(timed, new Date("2026-09-07T09:00:01Z"));
  assert.equal(late.flagged, true);
  assert.equal(late.overdueSeconds, 1);
  assert.equal(late.expectedReturnAt, "2026-09-07T09:00:00.000Z");
  for (const status of ["PENDING", "NOTED", "APPROVED", "DENIED"]) {
    assert.equal(tripTiming({ ...timed, status }, new Date("2026-10-01T00:00:00Z")).flagged, false);
  }
});

test("Completed late trips remain flagged and their overrun freezes at arrival", () => {
  const completed = { ...request, status: "COMPLETED", estimatedSeconds: 3600, arrivedAt: new Date("2026-09-07T09:12:34Z") };
  const timing = tripTiming(completed, new Date("2026-10-01T00:00:00Z"));
  assert.equal(timing.flagged, true);
  assert.equal(timing.overdueSeconds, 754);
  assert.equal(tripTiming({ ...completed, arrivedAt: null, elapsedSeconds: 4000 }).overdueSeconds, 400);
});

test("Missing estimates never create overdue flags and existing flags are preserved", () => {
  assert.equal(tripTiming(request).isOverdue, false);
  assert.equal(tripTiming({ ...request, estimatedSeconds: 0 }).expectedReturnAt, null);
  assert.equal(tripTiming({ ...request, flagged: true }).flagged, true);
  assert.equal(tripTiming({ ...request, departedAt: null, estimatedSeconds: 86400, elapsedSeconds: 90000 }).overdueSeconds, 3600);
});
