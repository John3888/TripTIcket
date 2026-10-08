import test from "node:test";
import assert from "node:assert/strict";

// Unit tests never connect to the production database.
process.env.DATABASE_URL = "mysql://test:test@127.0.0.1:3306/test";
process.env.PORT = "8500";
process.env.JWT_SECRET = "unit-test-secret-at-least-24-characters";
const { prisma } = await import("../../config/prismaClient.js");
const { setRealtime } = await import("../../realtime.js");
const { record } = await import("./gps.services.js");
const { gpsSchema } = await import("./gps.validation.js");
const { filterFix } = await import("./gps.filter.js");

test("ingestion keeps liveness independent of accepted coordinates", async (t) => {
  let enabled = true, active = true, lastSeenAt: Date | null = null;
  const telemetry: any[] = [], positions: any[] = [], events: { event: string; payload: any; rooms: string[] }[] = [];
  const operator = (rooms: string[]): any => ({
    to: (room: string) => operator([...rooms, room]),
    emit: (event: string, payload: any) => events.push({ event, payload, rooms }),
  });
  setRealtime({ to: (room: string) => operator([room]) } as any);
  const db = {
    $queryRaw: async () => [],
    trackingDevice: {
      findUnique: async () => ({ deviceId: "tracker", vehicleId: "vehicle", enabled, lastSeenAt }),
      update: async ({ data }: any) => { lastSeenAt = data.lastSeenAt; },
    },
    tripRequest: {
      findFirst: async () => active ? { id: "trip", departedAt: new Date(Date.now() - 60000), employee: { department: "MIS" } } : null,
      findMany: async () => [{ employee: { department: "MIS" } }, { employee: { department: "FINANCE" } }],
    },
    deviceTelemetry: { findFirst: async () => null, create: async ({ data }: any) => { telemetry.push(data); } },
    gpsPoint: {
      findFirst: async () => null,
      create: async ({ data }: any) => { positions.push(data); return { ...data, id: 1n, heading: null, speedKph: null }; },
    },
  };
  const originalTransaction = prisma.$transaction;
  (prisma as any).$transaction = async (callback: any) => callback(db);
  const body = (extra = {}) => gpsSchema.parse({ deviceId: "tracker", hasFix: true, latitude: 10, longitude: 122, hdop: 1, satellites: 8, ...extra });
  const reset = () => { enabled = active = true; lastSeenAt = null; events.length = telemetry.length = positions.length = 0; };
  try {
    await t.test("accepted fix emits heartbeat and persisted position with existing response", async () => {
      reset(); const response = await record(body());
      assert.equal(response.recorded, true);
      assert.equal(positions.length, 1);
      assert.deepEqual(events.map((e) => e.event), ["gps:heartbeat", "gps:position"]);
      assert.deepEqual(events[0]!.rooms, ["live-gps", "live-gps:MIS", "live-gps:FINANCE"]);
      assert.equal(events[0]!.payload.lastSeenAt, lastSeenAt!.toISOString());
      assert.equal("heartbeat" in response, false);
    });
    await t.test("no fix and poor quality emit heartbeat only", async () => {
      for (const extra of [{ hasFix: false }, { hdop: 8 }, { satellites: 2 }, { accuracyMeters: 50 }]) {
        reset(); const response = await record(body(extra));
        assert.equal(response.recorded, false);
        assert.ok(lastSeenAt);
        assert.equal(telemetry.length, 1);
        assert.equal(positions.length, 0);
        assert.deepEqual(events.map((e) => e.event), ["gps:heartbeat"]);
      }
    });
    await t.test("no ongoing trip preserves liveness without extending a completed trail", async () => {
      reset(); active = false;
      assert.equal((await record(body())).reason, "no_active_trip");
      assert.equal(positions.length, 0);
      assert.equal(events[0]!.event, "gps:heartbeat");
    });
    await t.test("disabled tracker and excessive send rate cannot emit liveness", async () => {
      reset(); enabled = false;
      await assert.rejects(record(body()), { status: 403 });
      assert.equal(lastSeenAt, null); assert.equal(events.length, 0);
      reset(); lastSeenAt = new Date();
      await assert.rejects(record(body()), { status: 429 });
      assert.equal(events.length, 0); assert.equal(telemetry.length, 0);
    });
    await t.test("invalid time and missing coordinates remain rejected", async () => {
      reset(); assert.equal((await record(body({ recordedAt: new Date(Date.now() + 120000) }))).reason, "invalid_time");
      assert.equal(positions.length, 0);
      assert.throws(() => body({ latitude: null }));
    });
    await t.test("existing jump, ordering and stationary filter protections remain", () => {
      const previous = { latitude: 10, longitude: 122, recordedAt: new Date(), accuracyMeters: 5, speedKph: 0, variance: 25 };
      assert.equal(filterFix(previous, previous).reason, "out_of_order");
      assert.equal(filterFix({ ...previous, latitude: 11, recordedAt: new Date(previous.recordedAt.getTime() + 1000) }, previous).reason, "implausible_jump");
      const stationary = filterFix({ ...previous, latitude: 10.00001, recordedAt: new Date(previous.recordedAt.getTime() + 1000) }, previous);
      assert.equal(stationary.reason, "stationary"); assert.equal(stationary.state?.latitude, 10);
    });
  } finally {
    (prisma as any).$transaction = originalTransaction;
  }
});
