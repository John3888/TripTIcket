import type { GpsDevice, GpsPoint, Ticket, TripTrack } from "../../types/trip-ticket";
import { hasValidCoordinates, latestGpsPoint } from "./gps-utils";
import { advanceMotion, usableTracePoint } from "./gps-motion";

export const INACTIVE_TIMEOUT_MS = 180000;
export const TRAIL_GAP_MS = 60000;
export const POSITION_STALE_MS = 120000;

export function liveFleet(trips: Ticket[]) {
  const completed = new Map<string, Ticket>();
  const ongoing = new Map<string, Ticket>();
  const key = (trip: Ticket) => tripDevice(trip)?.vehicleId ?? trip.plate;
  for (const trip of trips) {
    const id = key(trip);
    if (trip.status === "ongoing") ongoing.set(id, trip);
    if (trip.status === "completed" && validPosition(trip.gps)) {
      const previous = completed.get(id);
      if (!previous?.gps || Date.parse(trip.gps.recordedAt) > Date.parse(previous.gps.recordedAt)) completed.set(id, trip);
    }
  }
  // Keep one reference per vehicle. A new trip can use the last known position
  // until its first fix, without inheriting any vertices from the old trip.
  return [...ongoing].map(([id, trip]) => trip.gps || !completed.get(id)?.gps ? trip : { ...trip, gps: completed.get(id)!.gps })
    .concat([...completed].filter(([id]) => !ongoing.has(id)).map(([, trip]) => trip));
}

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

export function validPosition(point: GpsPoint | null | undefined): point is GpsPoint {
  return hasValidCoordinates(point) && typeof point.id === "string" && point.id.length > 0 &&
    typeof point.recordedAt === "string" && Number.isFinite(Date.parse(point.recordedAt)) &&
    (point.deviceId == null || typeof point.deviceId === "string") &&
    (point.accuracyMeters == null || (Number.isFinite(point.accuracyMeters) && point.accuracyMeters >= 0));
}

// Telemetry freshness advances while stopped; geometry advances only after
// consistent movement has been confirmed.
export function applyPosition(trip: Ticket, point: GpsPoint): Ticket {
  if (!validPosition(point) || trip.status !== "ongoing") return trip;
  const time = Date.parse(point.recordedAt);
  const departure = trip.departure ?? trip.track?.departedAt;
  if (!departure || time < Date.parse(departure)) return trip;
  if (trip.arrival && time > Date.parse(trip.arrival)) return trip;
  if (trip.gps && (point.id === trip.gps.id || time <= Date.parse(trip.gps.recordedAt))) return trip;
  const track: TripTrack = trip.track ?? {
    ticketId: trip.id, segments: [], distanceMeters: 0, incomplete: true,
    matching: "unmatched", position: null, lastRecordedAt: null, sampleCount: 0,
    maxSpeedKph: trip.gpsMaxSpeedKph ?? 200,
  };
  if (!usableTracePoint(point, track.maxSpeedKph)) return { ...trip, track: {
    ...track, moving: false, motionState: track.motionState ? { ...track.motionState, moving: false, candidates: [], interrupted: true } : undefined,
  } };
  const anchor = track.trailLastPoint;
  const previousTime = Date.parse(track.trailLastObservedAt ?? anchor?.recordedAt ?? "");
  const seed = track.motionState ?? (anchor ? { anchor, lastObservedAt: track.trailLastObservedAt ?? anchor.recordedAt,
    moving: false, stoppedSamples: 0, candidates: [] } : undefined);
  const motion = advanceMotion(seed, point);
  const gap = motion.gap || (Number.isFinite(previousTime) && time - previousTime > TRAIL_GAP_MS);
  const display = { ...point, latitude: motion.state.anchor.latitude, longitude: motion.state.anchor.longitude };
  const distance = motion.vertex && !gap && anchor ? metersBetween(anchor, point) : 0;
  let segments = track.segments;
  if (motion.vertex) {
    const last = segments.at(-1);
    const extend = !gap && anchor && last?.kind === "observed";
    const tail = extend ? {
      ...last, coordinates: [...last.coordinates, [point.longitude, point.latitude]],
      distanceMeters: last.distanceMeters + distance, live: true,
    } : {
      coordinates: [[point.longitude, point.latitude]],
      distanceMeters: 0, estimated: false, kind: "observed" as const, live: true,
    };
    segments = extend ? [...segments.slice(0, -1), tail] : [...segments, tail];
  }
  return { ...trip, gps: latestGpsPoint(trip.gps, display), track: {
    ...track, segments, trailLastPoint: motion.state.anchor, trailLastObservedAt: point.recordedAt,
    motionState: motion.state, moving: motion.state.moving,
    distanceMeters: track.distanceMeters + distance,
    estimatedDistanceMeters: track.estimatedDistanceMeters ?? 0,
    incomplete: track.incomplete || gap, matching: "unmatched", position: display,
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

// The store already includes recent vertices. Draw them immediately even when
// the full-history request is slow or fails, then replace with full history.
export function restoreTrail(trip: Ticket): Ticket {
  if (!trip.departure || !["ongoing", "completed"].includes(trip.status)) return trip;
  const points = (trip.gpsTrail ?? []).filter(validPosition).slice().sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
  let restored: Ticket = { ...trip, status: "ongoing", gps: trip.track?.position ?? null };
  for (const point of points) restored = applyPosition(restored, point);
  const fallback = trip.gps && usableTracePoint(trip.gps, trip.gpsMaxSpeedKph) ? trip.gps : null;
  return { ...trip, gps: restored.gps ?? fallback, track: restored.track };
}
