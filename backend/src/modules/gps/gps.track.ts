import { ENV } from "../../config/env.js";
import { prisma } from "../../config/prismaClient.js";
import { AppError } from "../../middlewares/error.middleware.js";

import { motionTrace, observed } from "./gps.trace.js";

export async function tripTrack(ticketId: string, actor: { role: string; department: string }) {
  const trip = await prisma.tripRequest.findFirst({ where: {
    id: ticketId,
    ...(actor.role === "Department Head" ? { employee: { department: actor.department as never } } : {}),
  }, include: { vehicle: { include: { trackingDevice: true } } } });
  if (!trip) throw new AppError(404, "Trip not found.");
  const rows = trip.departedAt ? await prisma.gpsPoint.findMany({ where: { tripRequestId: ticketId, filterVersion: 1,
    recordedAt: { ...(trip.departedAt ? { gte: trip.departedAt } : {}), ...(trip.arrivedAt ? { lte: trip.arrivedAt } : {}) },
  }, orderBy: [{ recordedAt: "asc" }, { id: "asc" }] }) : [];
  const points = rows.map((p) => ({ id: p.id.toString(), latitude: Number(p.latitude), longitude: Number(p.longitude), recordedAt: p.recordedAt.toISOString(), accuracyMeters: p.accuracyMeters == null ? null : Number(p.accuracyMeters), speedKph: p.speedKph == null ? null : Number(p.speedKph) }));
  const { groups, state, lastTrusted } = motionTrace(points, ENV.GPS_MAX_SPEED_KPH);
  const segments = groups.map(observed);
  const raw = points.at(-1);
  return {
    device: trip.vehicle?.trackingDevice ? { deviceId: trip.vehicle.trackingDevice.deviceId, vehicleId: trip.vehicleId, enabled: trip.vehicle.trackingDevice.enabled, lastSeenAt: trip.vehicle.trackingDevice.lastSeenAt?.toISOString() ?? null } : null,
    trailLastPoint: state?.anchor ?? null, trailLastObservedAt: raw?.recordedAt ?? null,
    motionState: state, moving: state?.moving ?? false,
    maxSpeedKph: ENV.GPS_MAX_SPEED_KPH ?? 200,
    trailMinMeters: 0, inactiveTimeoutMs: ENV.GPS_INACTIVE_TIMEOUT_MS,
    departedAt: trip.departedAt?.toISOString() ?? null, arrivedAt: trip.arrivedAt?.toISOString() ?? null,
    estimatedDistanceMeters: segments.filter((s) => s.estimated).reduce((sum, s) => sum + s.distanceMeters, 0),
    ticketId, segments, distanceMeters: segments.reduce((sum, segment) => sum + segment.distanceMeters, 0),
    incomplete: groups.length > 1 || points.length < 2, matching: "unmatched",
    position: lastTrusted && state ? { ...lastTrusted, latitude: state.anchor.latitude, longitude: state.anchor.longitude } : null,
    lastRecordedAt: raw?.recordedAt ?? null,
    sampleCount: points.length,
  };
}
