import test from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "mysql://test:test@127.0.0.1:3306/test";
process.env.PORT = "8500";
process.env.JWT_SECRET = "unit-test-secret-at-least-24-characters";
process.env.GPS_TRAIL_MIN_METERS = "15";
const { prisma } = await import("../../config/prismaClient.js");
const { cleanTrace, tripTrack, trailThreshold } = await import("./gps.track.js");
const start = Date.parse("2026-10-01T00:00:00Z");
const point = (id: string, metres: number, seconds: number, accuracyMeters = 5) => ({
  id, latitude: 10 + metres / 111195, longitude: 122,
  recordedAt: new Date(start + seconds * 1000).toISOString(), accuracyMeters,
});

test("reconstruction uses the same accuracy-aware displacement threshold as live trails", () => {
  const first = point("1", 0, 1, 25);
  assert.equal(trailThreshold(first, point("2", 20, 2)), 25);
  const groups = cleanTrace([first, point("2", 20, 2), point("3", 30, 3)]);
  assert.deepEqual(groups[0]!.map((p) => p.id), ["1", "3"]);
});

test("optional OSRM reconstruction preserves accepted positions and fallback history", async (t) => {
  const originalTrip = prisma.tripRequest.findFirst, originalPoints = prisma.gpsPoint.findMany, originalFetch = globalThis.fetch;
  let rows: any[] = [], calls: string[] = [], mode = "matched";
  (prisma.tripRequest as any).findFirst = async () => ({
    id: "trip", vehicleId: "vehicle", departedAt: new Date(start), arrivedAt: null,
    vehicle: { trackingDevice: { deviceId: "tracker", enabled: true, lastSeenAt: new Date(start) } },
  });
  (prisma.gpsPoint as any).findMany = async () => rows;
  globalThis.fetch = (async (url: any) => {
    calls.push(String(url));
    if (mode === "timeout") throw new DOMException("Timed out", "TimeoutError");
    if (mode === "unavailable") return new Response("", { status: 503 });
    if (String(url).includes("/route/")) return Response.json({ code: "Ok", routes: [{ distance: 300, geometry: { coordinates: [[122, 10], [122, 10.003]] } }] });
    return Response.json({ code: "Ok", matchings: [{ confidence: 0.9, distance: 20, geometry: { coordinates: [[122, 10], [122, 10.0002]] } }],
      tracepoints: mode === "partial" ? [null, { location: [122, 10.0002], matchings_index: 0 }] :
        [{ location: [122, 10], matchings_index: 0 }, { location: [122, 10.0002], matchings_index: 0 }],
    });
  }) as typeof fetch;
  const load = (prefix: number, gap = false) => {
    rows = [point(String(prefix), 0, 1), point(String(prefix + 1), 20, 4),
      ...(gap ? [point(String(prefix + 2), 300, 124), point(String(prefix + 3), 320, 128)] : [])]
      .map((p) => ({ ...p, id: BigInt(p.id), recordedAt: new Date(p.recordedAt) }));
    calls = [];
  };
  try {
    await t.test("successful matching never replaces the accepted marker position", async () => {
      load(100); mode = "matched";
      const track = await tripTrack("trip", { role: "Administrator", department: "MIS" });
      assert.equal(track.segments[0]!.estimated, undefined);
      assert.equal(track.position?.latitude, rows[1].latitude);
      assert.equal(track.trailLastPoint?.id, "101");
      assert.equal(track.inactiveTimeoutMs, 180000);
    });
    await t.test("partial matching renders the complete observed accepted path", async () => {
      load(200); mode = "partial";
      const track = await tripTrack("trip", { role: "Administrator", department: "MIS" });
      assert.equal(track.segments[0]!.kind, "observed");
      assert.equal(track.segments[0]!.coordinates.length, 2);
      assert.equal(track.incomplete, true);
    });
    await t.test("match and gap results are cached without another OSRM request", async () => {
      load(300, true); mode = "matched";
      await tripTrack("trip", { role: "Administrator", department: "MIS" });
      assert.equal(calls.filter((url) => url.includes("/route/")).length, 1);
      calls = [];
      await tripTrack("trip", { role: "Administrator", department: "MIS" });
      assert.equal(calls.length, 0);
    });
    await t.test("unavailable OSRM leaves accepted history intact and suppresses repeated requests", async () => {
      load(400, true); mode = "unavailable";
      const track = await tripTrack("trip", { role: "Administrator", department: "MIS" });
      assert.equal(track.segments[0]!.kind, "observed");
      assert.equal(track.position?.latitude, rows[3].latitude);
      assert.equal(track.sampleCount, 4);
      assert.equal(calls.length, 1);
    });
    await t.test("a timeout is covered by the same outage fallback", async () => {
      load(500); mode = "timeout";
      const now = Date.now;
      // Advance past the outage cooldown without adding a blocking sleep.
      Date.now = () => now() + 6000;
      try {
        const track = await tripTrack("trip", { role: "Administrator", department: "MIS" });
        assert.equal(track.segments[0]!.kind, "observed");
        assert.equal(calls.length, 1);
      } finally { Date.now = now; }
    });
  } finally {
    prisma.tripRequest.findFirst = originalTrip;
    prisma.gpsPoint.findMany = originalPoints;
    globalThis.fetch = originalFetch;
  }
});
