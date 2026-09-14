import assert from "node:assert/strict";
import { test } from "node:test";
import { formatTravelTime, receiveTicketTiming, travelSeconds, tripOverrun } from "../services/travel-time";
import type { Ticket } from "../types/trip-ticket";

const ticket: Ticket = {
  id: "TEST-1",
  requestedBy: "Employee",
  plate: "TEST-123",
  destination: "Office",
  purpose: "",
  status: "ongoing",
  departure: "2026-09-07T08:00:00Z",
  elapsedSeconds: 120,
};

test("Live duration advances from server time even when the kiosk clock is different", () => {
  const [received] = receiveTicketTiming([ticket], 1000);
  assert.equal(travelSeconds(received!, 6000), 125);
  assert.equal(travelSeconds(received!, 66000), 185);
});

test("Refreshed records resume from the server duration instead of resetting", () => {
  const [received] = receiveTicketTiming([{ ...ticket, elapsedSeconds: 300 }], 10000);
  assert.equal(travelSeconds(received!), 300);
  assert.equal(travelSeconds(received!, 12000), 302);
});

test("Arrival stops counting and approvals do not start a timer", () => {
  const [received] = receiveTicketTiming([ticket], 1000);
  assert.equal(travelSeconds({ ...received!, status: "completed" }, 999999), 120);
  assert.equal(travelSeconds({ ...received!, status: "approved", elapsedSeconds: 0 }, 999999), 0);
});

test("Duration includes seconds and supports trips longer than one day", () => {
  assert.equal(formatTravelTime(0), "00:00:00");
  assert.equal(formatTravelTime(65), "00:01:05");
  assert.equal(formatTravelTime(90123), "25:02:03");
});

test("Overdue flags appear live one second after the estimate without a store refresh", () => {
  const [received] = receiveTicketTiming([{ ...ticket, estimatedSeconds: 125 }], 0);
  assert.equal(tripOverrun(received!, 4999).flagged, false);
  assert.equal(tripOverrun(received!, 5000).flagged, false);
  assert.equal(tripOverrun(received!, 6000).flagged, true);
  assert.equal(tripOverrun(received!, 6000).overdueSeconds, 1);
});

test("History preserves overrun and approval waiting time cannot be overdue", () => {
  const completed = { ...ticket, status: "completed" as const, estimatedSeconds: 60 };
  assert.equal(tripOverrun(completed, 99999999).overdueSeconds, 60);
  assert.equal(tripOverrun({ ...completed, status: "approved" }, 99999999).flagged, false);
  assert.equal(tripOverrun({ ...completed, estimatedSeconds: 0 }).flagged, false);
  assert.equal(tripOverrun({ ...completed, estimatedSeconds: undefined, flagged: true }).flagged, true);
});

test("Legacy day/hour/minute estimates support multi-day duration comparisons", () => {
  const completed = { ...ticket, status: "completed" as const, days: 1, hours: 1, minutes: 1, elapsedSeconds: 90061 };
  assert.equal(tripOverrun(completed).estimatedSeconds, 90060);
  assert.equal(tripOverrun(completed).overdueSeconds, 1);
});
