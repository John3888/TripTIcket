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
