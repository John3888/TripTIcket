import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

process.env.DATABASE_URL = "mysql://test:test@127.0.0.1:1/gps_test";
process.env.JWT_SECRET = "gps-test-secret-not-for-production";
const { prisma } = await import("../../config/prismaClient.js");
const { record } = await import("./gps.services.js");
const { publicStore } = await import("../store/store.services.js");

function replaceMethod(context: TestContext, target: any, key: string, implementation: any) {
  const original = target[key];
  target[key] = context.mock.fn(implementation);
  context.after(() => {
    target[key] = original;
  });
}

const point = (index: number) => ({
  id: BigInt(index),
  tripRequestId: "000001",
  deviceId: "test-gps",
  latitude: 14.6 + index / 10000,
  longitude: 121.02,
  speedKph: null,
  heading: null,
  accuracyMeters: null,
  recordedAt: new Date(Date.UTC(2026, 8, 8, 1, 0, index)),
});

test("The GPS receiver returns a JSON-safe success response after recording a position", async (context) => {
  replaceMethod(context, prisma.tripRequest, "findFirst", async () => ({ id: "000001" }));
  replaceMethod(context, prisma.gpsPoint, "create", async () => point(150));
  const response = await record({ plate: "TEST-123", latitude: 14.615, longitude: 121.02 });
  const payload = JSON.parse(JSON.stringify(response));
  assert.equal(payload.ok, true);
  assert.equal(payload.ticketNo, "000001");
  assert.equal(payload.gps.id, "150");
  assert.equal(payload.gps.latitude, 14.615);
  assert.equal(payload.gps.tripRequestId, "000001");
});

test("Reloading Live GPS uses the newest 120 reports in chronological order", async (context) => {
  for (const model of [
    prisma.employee,
    prisma.vehicle,
    prisma.user,
    prisma.workflowStep,
    prisma.notification,
  ]) {
    replaceMethod(context, model, "findMany", async () => []);
  }
  const reports = Array.from({ length: 150 }, (_, index) => point(index + 1));
  replaceMethod(context, prisma.tripRequest, "findMany", async (query: any) => {
    const ordering = query.include.gpsPoints;
    const ordered = ordering.orderBy.recordedAt === "desc" ? [...reports].reverse() : reports;
    return [
      {
        id: "000001",
        status: "ONGOING",
        requestedAt: new Date("2026-09-08T00:00:00Z"),
        employee: { displayName: "Test Employee", role: "Employee", department: "OPERATIONS" },
        vehicle: { plate: "TEST-123" },
        destination: "Test office",
        purpose: "Test trip",
        estimatedSeconds: 3600,
        elapsedSeconds: 0,
        departedAt: null,
        arrivedAt: null,
        gpsPoints: ordered.slice(0, ordering.take),
      },
    ];
  });
  const store = await publicStore({
    actor: {
      userId: "TEST",
      employeeId: "TEST",
      name: "Test Admin",
      role: "Administrator",
      department: "MIS",
    },
    page: "live-gps",
  });
  const trip = store.outgoing[0]!;
  assert.equal(trip.gps?.id, "150");
  assert.equal(trip.gpsTrail.length, 120);
  assert.equal(trip.gpsTrail[0]?.id, "31");
  assert.equal(trip.gpsTrail.at(-1)?.id, "150");
});
