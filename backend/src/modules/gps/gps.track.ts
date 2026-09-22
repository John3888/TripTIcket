import { ENV } from "../../config/env.js";
import { prisma } from "../../config/prismaClient.js";
import { AppError } from "../../middlewares/error.middleware.js";

type Point = { id: string; latitude: number; longitude: number; recordedAt: string; accuracyMeters: number | null };
type Segment = { coordinates: number[][]; distanceMeters: number; estimated?: boolean; kind?: "observed" | "gap" };
type Match = { segments: Segment[]; position: number[] | null; incomplete: boolean };
const cache = new Map<string, { until: number; result: Promise<Match> }>();
let unavailableUntil = 0;

export function distance(a: Point, b: Point) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Reject jumps and stationary jitter; gaps remain separate paths, never straight connectors.
export function cleanTrace(points: Point[]) {
  const groups: Point[][] = [];
  let group: Point[] = [];
  let previousTime: number | undefined;
  for (const point of points) {
    if ((point.accuracyMeters ?? 10) > 100) continue;
    const previous = group.at(-1);
    if (previous) {
      const seconds = (Date.parse(point.recordedAt) - Date.parse(previous.recordedAt)) / 1000;
      if (seconds < 1) continue;
      if (previousTime !== undefined && (Date.parse(point.recordedAt) - previousTime) / 1000 > 60) { groups.push(group); group = []; }
      else {
        const meters = distance(previous, point);
        if (meters / seconds > 55) continue;
        if (meters < Math.max(5, Math.min(15, point.accuracyMeters ?? 5))) {
          previousTime = Date.parse(point.recordedAt);
          continue;
        }
      }
    }
    group.push(point);
    previousTime = Date.parse(point.recordedAt);
  }
  if (group.length) groups.push(group);
  return groups;
}

async function match(points: Point[]): Promise<Match> {
  if (points.length < 2) return { segments: [], position: null, incomplete: true };
  const key = points.map((p) => p.id).join(",");
  const cached = cache.get(key);
  if (cached && cached.until > Date.now()) return cached.result;
  if (unavailableUntil > Date.now()) return { segments: [], position: null, incomplete: true };
  const result = (async (): Promise<Match> => {
    try {
      const coordinates = points.map((p) => `${p.longitude},${p.latitude}`).join(";");
      const query = new URLSearchParams({
        geometries: "geojson", overview: "full", gaps: "split", tidy: "false",
        timestamps: points.map((p) => Math.floor(Date.parse(p.recordedAt) / 1000)).join(";"),
        radiuses: points.map((p) => Math.max(5, p.accuracyMeters ?? 15)).join(";"),
      });
      const response = await fetch(`${ENV.OSRM_URL}/match/v1/driving/${coordinates}?${query}`, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error("OSRM unavailable");
      const data = await response.json() as {
        code: string;
        matchings: { confidence: number; distance: number; geometry: { coordinates: number[][] } }[];
        tracepoints: ({ location: number[]; matchings_index: number } | null)[];
      };
      if (data.code !== "Ok") return { segments: [], position: null, incomplete: true };
      const segments = data.matchings.filter((m) => m.confidence >= 0.5).map((m) => ({ coordinates: m.geometry.coordinates, distanceMeters: m.distance }));
      const last = data.tracepoints.at(-1);
      const position = last && (data.matchings[last.matchings_index]?.confidence ?? 0) >= 0.5 ? last.location : null;
      return { segments, position, incomplete: data.tracepoints.some((p) => !p) || segments.length !== data.matchings.length };
    } catch {
      // One outage must not cost a three-second timeout for every historical chunk.
      unavailableUntil = Date.now() + 5000;
      cache.delete(key);
      return { segments: [], position: null, incomplete: true };
    }
  })();
  if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
  cache.set(key, { until: Date.now() + 300000, result });
  return result;
}

function observed(points: Point[]): Segment {
  return { coordinates: points.map((p) => [p.longitude, p.latitude]), distanceMeters: points.slice(1).reduce((sum, p, i) => sum + distance(points[i]!, p), 0), estimated: true, kind: "observed" };
}

async function bridge(a: Point, b: Point): Promise<Segment | null> {
  const seconds = (Date.parse(b.recordedAt) - Date.parse(a.recordedAt)) / 1000;
  const straight = distance(a, b);
  if (straight < 5) return null;
  // Do not invent multi-hour routes or join physically implausible jumps.
  if (seconds <= 0 || seconds > 900 || straight / seconds > 55) return null;
  try {
    const response = await fetch(`${ENV.OSRM_URL}/route/v1/driving/${a.longitude},${a.latitude};${b.longitude},${b.latitude}?geometries=geojson&overview=full`, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) throw new Error();
    const data = await response.json() as { code: string; routes: { distance: number; geometry: { coordinates: number[][] } }[] };
    const route = data.routes?.[0];
    if (data.code === "Ok" && route && route.distance / seconds <= 55 && route.distance < straight * 5)
      return { coordinates: route.geometry.coordinates, distanceMeters: route.distance, estimated: true, kind: "gap" };
  } catch { /* Keep an explicit approximate gap if routing is unavailable. */ }
  return { ...observed([a, b]), kind: "gap" };
}

export async function tripTrack(ticketId: string, actor: { role: string; department: string }) {
  const trip = await prisma.tripRequest.findFirst({ where: {
    id: ticketId,
    ...(actor.role === "Department Head" ? { employee: { department: actor.department as never } } : {}),
  }, include: { vehicle: { include: { trackingDevice: true } } } });
  if (!trip) throw new AppError(404, "Trip not found.");
  const rows = await prisma.gpsPoint.findMany({ where: { tripRequestId: ticketId, filterVersion: 1,
    recordedAt: { ...(trip.departedAt ? { gte: trip.departedAt } : {}), ...(trip.arrivedAt ? { lte: trip.arrivedAt } : {}) },
  }, orderBy: [{ recordedAt: "asc" }, { id: "asc" }] });
  const points = rows.map((p) => ({ id: p.id.toString(), latitude: Number(p.latitude), longitude: Number(p.longitude), recordedAt: p.recordedAt.toISOString(), accuracyMeters: p.accuracyMeters == null ? null : Number(p.accuracyMeters) }));
  const groups = cleanTrace(points);
  const segments: Segment[] = [];
  let position: number[] | null = null;
  let incomplete = groups.length !== 1 || groups[0]!.length < 2;
  let previousGroup: Point[] | undefined;
  for (const group of groups) {
    if (previousGroup) {
      const connection = await bridge(previousGroup.at(-1)!, group[0]!);
      if (connection) segments.push(connection);
    }
    for (let start = 0; start < group.length - 1; start += 49) {
      const chunk = group.slice(start, start + 50);
      const matched = await match(chunk);
      // Partial OSRM output must not silently erase observed movement.
      segments.push(...(matched.incomplete || !matched.segments.length ? [observed(chunk)] : matched.segments));
      position = matched.position;
      incomplete ||= matched.incomplete;
    }
    if (group.length === 1) { position = null; incomplete = true; }
    previousGroup = group;
  }
  const latest = groups.at(-1)?.at(-1);
  const raw = points.at(-1);
  // Filtering is for distance estimation, not permission to replace live telemetry
  // with a historical fix. Only use a match belonging to the newest report.
  const currentMatch = raw && latest && (latest.id === raw.id || distance(raw, latest) < 1) ? position : null;
  return {
    device: trip.vehicle?.trackingDevice ? { enabled: trip.vehicle.trackingDevice.enabled, lastSeenAt: trip.vehicle.trackingDevice.lastSeenAt?.toISOString() ?? null } : null,
    departedAt: trip.departedAt?.toISOString() ?? null, arrivedAt: trip.arrivedAt?.toISOString() ?? null,
    estimatedDistanceMeters: segments.filter((s) => s.estimated).reduce((sum, s) => sum + s.distanceMeters, 0),
    ticketId, segments, distanceMeters: segments.reduce((sum, segment) => sum + segment.distanceMeters, 0),
    incomplete, matching: currentMatch ? "matched" : "unmatched",
    position: raw ? { ...raw, longitude: currentMatch?.[0] ?? raw.longitude, latitude: currentMatch?.[1] ?? raw.latitude } : null,
    lastRecordedAt: raw?.recordedAt ?? null,
    sampleCount: points.length,
  };
}
