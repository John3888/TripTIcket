import type { GpsDevice, GpsPoint, Ticket, TripTrack } from "../../types/trip-ticket";
import { hasValidCoordinates, latestGpsPoint } from "./gps-utils";

export const INACTIVE_TIMEOUT_MS = 180000;
export const TRAIL_MIN_METERS = 15;
export const TRAIL_GAP_MS = 60000;
export const POSITION_STALE_MS = 120000;

export function tripDevice(trip: Ticket) {
  // An explicit null from the store means no tracker is currently installed.
  return trip.device !== undefined ? trip.device : trip.track?.device;
}

export function deviceActive(device: GpsDevice | null | undefined, now: number, timeout = INACTIVE_TIMEOUT_MS) {
  const seen = Date.parse(device?.lastSeenAt ?? "");
  return !!device?.enabled && Number.isFinite(seen) && now - seen <= timeout;
}

export function metersBetween(a: GpsPoint, b: GpsPoint) {
  const r = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * r / 2) ** 2 +
    Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin((b.longitude - a.longitude) * r / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function trailThreshold(a: GpsPoint, b: GpsPoint, base = TRAIL_MIN_METERS) {
  return Math.max(base, a.accuracyMeters ?? 15, b.accuracyMeters ?? 15);
}

export function validPosition(point: GpsPoint | null | undefined): point is GpsPoint {
  return hasValidCoordinates(point) && typeof point.id === "string" && point.id.length > 0 &&
    typeof point.recordedAt === "string" && Number.isFinite(Date.parse(point.recordedAt)) &&
    (point.deviceId == null || typeof point.deviceId === "string") &&
    (point.accuracyMeters == null || (Number.isFinite(point.accuracyMeters) && point.accuracyMeters >= 0));
}

// Only accepted server events enter this helper. Markers and trail vertices are
// deliberately separate: stationary fixes update the marker without geometry.
export function applyPosition(trip: Ticket, point: GpsPoint): Ticket {
  if (!validPosition(point) || trip.status !== "ongoing") return trip;
  const time = Date.parse(point.recordedAt);
  if (trip.departure && time < Date.parse(trip.departure)) return trip;
  if (trip.gps && (point.id === trip.gps.id || time <= Date.parse(trip.gps.recordedAt))) return trip;
  const track: TripTrack = trip.track ?? {
    ticketId: trip.id, segments: [], distanceMeters: 0, incomplete: true,
    matching: "unmatched", position: null, lastRecordedAt: null, sampleCount: 0,
  };
  const anchor = track.trailLastPoint;
  const previousTime = Date.parse(track.trailLastObservedAt ?? anchor?.recordedAt ?? "");
  const gap = Number.isFinite(previousTime) && time - previousTime > TRAIL_GAP_MS;
  let segments = track.segments;
  let distance = 0;
  let trailLastPoint = anchor ?? point;
  if (gap) trailLastPoint = point;
  else if (anchor && (distance = metersBetween(anchor, point)) >= trailThreshold(anchor, point, track.trailMinMeters)) {
    const last = segments.at(-1);
    const tail = last?.live ? {
      ...last, coordinates: [...last.coordinates, [point.longitude, point.latitude]],
      distanceMeters: last.distanceMeters + distance,
    } : {
      coordinates: [[anchor.longitude, anchor.latitude], [point.longitude, point.latitude]],
      distanceMeters: distance, estimated: true, kind: "observed" as const, live: true,
    };
    segments = last?.live ? [...segments.slice(0, -1), tail] : [...segments, tail];
    trailLastPoint = point;
  } else distance = 0;
  // A gap starts a new observed segment rather than drawing an invented route.
  if (gap && segments.at(-1)?.live) segments = segments.map((s, i) => i === segments.length - 1 ? { ...s, live: false } : s);
  return { ...trip, gps: latestGpsPoint(trip.gps, point), track: {
    ...track, segments, trailLastPoint, trailLastObservedAt: point.recordedAt,
    distanceMeters: track.distanceMeters + distance,
    estimatedDistanceMeters: (track.estimatedDistanceMeters ?? 0) + distance,
    incomplete: track.incomplete || gap, matching: "unmatched", position: point,
    lastRecordedAt: point.recordedAt, sampleCount: track.sampleCount + 1,
  } };
}

export function applyHeartbeat(trip: Ticket, heartbeat: { deviceId: string; vehicleId: string; lastSeenAt: string }): Ticket {
  const device = tripDevice(trip);
  if (!device || device.deviceId !== heartbeat.deviceId || device.vehicleId !== heartbeat.vehicleId ||
      !Number.isFinite(Date.parse(heartbeat.lastSeenAt)) ||
      Date.parse(device.lastSeenAt ?? "") >= Date.parse(heartbeat.lastSeenAt)) return trip;
  return { ...trip, device: { ...device, lastSeenAt: heartbeat.lastSeenAt } };
}
