import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import * as filter from "./gps.filter.js";
import * as trace from "./gps.trace.js";

function load(file: string, imports: Record<string, unknown>) {
  const output = { exports: {} as Record<string, any> };
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, {
    exports: output.exports,
    require(name: string) {
      assert.ok(name in imports, `Unexpected dependency: ${name}`);
      return imports[name];
    },
    fetch() { throw new Error("GPS trails must not request route matching"); },
  });
  return output.exports;
}

test("device presence updates last-seen and broadcasts without GPS or an active trip", async () => {
  let enabled = true, updated = false, committed = false;
  const events: any[] = [];
  const db = {
    $queryRaw: async () => [],
    trackingDevice: {
      findUnique: async () => ({ deviceId: "GPS-1", vehicleId: "CAR-1", enabled }),
      update: async ({ data }: any) => { assert.ok(Number.isFinite(data.lastSeenAt.getTime())); updated = true; },
    },
    tripRequest: { findMany: async () => [{ employee: { department: "IT" } }] },
  };
  const { touchDevice } = load("gps.services.ts", {
    "../../config/prismaClient.js": { prisma: { $transaction: async (fn: any) => {
      committed = false; const result = await fn(db); committed = true; return result;
    } } },
    "../../middlewares/error.middleware.js": { AppError: Error },
    "../../realtime.js": { emitGpsHeartbeat: (event: any, departments: any) => {
      assert.equal(committed, true); events.push({ event, departments });
    }, emitGpsPosition() { assert.fail("Presence cannot invent GPS coordinates"); } },
    "./gps.filter.js": filter,
    "../../config/env.js": { ENV: { GPS_MAX_SPEED_KPH: 200 } },
  });
  assert.equal(await touchDevice("GPS-1"), true); assert.equal(updated, true);
  assert.equal(events[0].event.vehicleId, "CAR-1");
  assert.equal(events[0].departments[0], "IT");
  enabled = false; updated = false;
  assert.equal(await touchDevice("GPS-1"), false); assert.equal(updated, false); assert.equal(events.length, 1);
});

test("recording accepts missing metadata, rejects known bad quality and respects official trip boundaries", async () => {
  const departure = new Date(Date.now() - 10000);
  let active: any = null;
  let previous: any = null;
  const saved: any[] = [];
  const telemetry: any[] = [];
  const db = {
    $queryRaw: async () => [],
    trackingDevice: {
      findUnique: async () => ({ deviceId: "GPS-1", vehicleId: "CAR-1", enabled: true, lastSeenAt: new Date() }),
      update: async () => ({}),
    },
    tripRequest: {
      findFirst: async () => active?.status === "ONGOING" && !active.arrivedAt ? active : null,
      findMany: async () => [],
    },
    gpsPoint: {
      findFirst: async () => previous,
      create: async ({ data }: any) => {
        previous = { ...data, id: BigInt(saved.length + 1), heading: data.heading ?? null };
        saved.push(previous);
        return previous;
      },
    },
    deviceTelemetry: { create: async ({ data }: any) => telemetry.push(data) },
  };
  const { record } = load("gps.services.ts", {
    "../../config/prismaClient.js": { prisma: { $transaction: async (fn: any) => fn(db) } },
    "../../middlewares/error.middleware.js": { AppError: Error },
    "../../realtime.js": { emitGpsHeartbeat() {}, emitGpsPosition() {} },
    "./gps.filter.js": filter,
    "../../config/env.js": { ENV: { GPS_MAX_SPEED_KPH: 200 } },
  });
  const sample = { deviceId: "GPS-1", hasFix: true, latitude: 10, longitude: 122,
    recordedAt: new Date(departure.getTime() + 1000) };
  assert.equal((await record(sample)).reason, "no_active_trip");
  active = { id: "TRIP-1", status: "ONGOING", departedAt: departure, employee: { department: "IT" } };
  assert.equal((await record({ ...sample, recordedAt: new Date(departure.getTime() - 1) })).reason, "invalid_time");
  assert.equal((await record(sample)).recorded, true);
  assert.equal((await record({ ...sample, hdop: 12, satellites: 2,
    recordedAt: new Date(sample.recordedAt.getTime() + 100) })).reason, "poor_hdop");
  assert.equal((await record({ deviceId: "GPS-1", hasFix: false })).reason, "no_fix");
  active = { ...active, status: "COMPLETED", arrivedAt: new Date() };
  assert.equal((await record({ ...sample, recordedAt: new Date() })).reason, "no_active_trip");
  assert.equal(saved.length, 1);
  assert.equal(telemetry.length, 6);
});

test("historical trail includes all points within departure/arrival and makes no routing requests", async () => {
  const start = new Date("2026-11-06T00:00:00Z");
  const end = new Date(start.getTime() + 3000);
  let started = true;
  const rows = [-1, 0, 1, 2, 3, 4].map((second) => ({ id: BigInt(second + 2),
    latitude: 10, longitude: 122, accuracyMeters: 5, recordedAt: new Date(start.getTime() + second * 1000) }));
  const { tripTrack } = load("gps.track.ts", {
    "../../config/env.js": { ENV: { GPS_INACTIVE_TIMEOUT_MS: 180000 } },
    "../../config/prismaClient.js": { prisma: {
      tripRequest: { findFirst: async () => ({ departedAt: started ? start : null, arrivedAt: end, vehicle: null }) },
      gpsPoint: { findMany: async ({ where }: any) => rows.filter((row) =>
        row.recordedAt >= where.recordedAt.gte && row.recordedAt <= where.recordedAt.lte) },
    } },
    "../../middlewares/error.middleware.js": { AppError: Error },
    "./gps.trace.js": trace,
  });
  const result = await tripTrack("TRIP-1", { role: "Administrator", department: "IT" });
  assert.equal(result.sampleCount, 4);
  assert.equal(result.segments[0].coordinates.length, 1);
  assert.equal(result.matching, "unmatched");
  assert.equal(result.lastRecordedAt, end.toISOString());
  started = false;
  assert.equal((await tripTrack("TRIP-1", { role: "Administrator" })).sampleCount, 0);
});
