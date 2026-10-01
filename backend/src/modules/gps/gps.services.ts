import { prisma } from "../../config/prismaClient.js";
import { AppError } from "../../middlewares/error.middleware.js";
import { emitGpsHeartbeat, emitGpsPosition } from "../../realtime.js";
import { filterFix, signalQuality } from "./gps.filter.js";
const GPS_MIN_REPORT_MS = 1000;
export async function record(body: any) {
  if (!body.deviceId) throw new AppError(400, "A registered device ID is required.");
  const result = await prisma.$transaction(async (db) => {
  // Serialize the persisted filter state per tracker, including multiple server workers.
  await db.$queryRaw`SELECT device_id FROM tracking_devices WHERE device_id = ${body.deviceId} FOR UPDATE`;
  const device = await db.trackingDevice.findUnique({ where: { deviceId: body.deviceId } });
  if (!device?.enabled) throw new AppError(403, "GPS device is not registered or is disabled.");
  const now = new Date();
  // The device row lock makes this safety limit work across server workers.
  if (device.lastSeenAt && now.getTime() - device.lastSeenAt.getTime() < GPS_MIN_REPORT_MS)
    throw new AppError(429, "GPS reports must be spaced at least one second apart.");
  await db.trackingDevice.update({ where: { deviceId: device.deviceId }, data: { lastSeenAt: now } });
  await db.$queryRaw`SELECT id FROM trip_requests WHERE vehicle_id = ${device.vehicleId} AND status = 'ONGOING' FOR UPDATE`;
  const trip = await db.tripRequest.findFirst({
    where: {
      status: "ONGOING",
      vehicleId: device.vehicleId,
    },
    orderBy: { departedAt: "desc" },
    include: { employee: { select: { department: true } } },
  });
  const recordedAt = body.recordedAt || now;
  const accuracy = body.accuracyMeters ?? (body.hdop == null ? 15 : Math.max(5, body.hdop * 5));
  const speed = body.speedKph ?? body.speedKmph ?? null;
  const previous = trip ? await db.gpsPoint.findFirst({ where: { tripRequestId: trip.id, deviceId: body.deviceId, filterVersion: 1 }, orderBy: { recordedAt: "desc" } }) : null;
  const lastReport = await db.deviceTelemetry.findFirst({ where: { deviceId: device.deviceId }, orderBy: { receivedAt: "desc" } });
  const quality = signalQuality(body);
  const recovering = lastReport && ["no_fix", "poor_satellites", "poor_hdop", "poor_accuracy"].includes(lastReport.disposition);
  const filtered = body.hasFix === false ? { reason: "no_fix", state: null }
    : !trip ? { reason: "no_active_trip", state: null }
    : recordedAt.getTime() > now.getTime() + 30000 || (trip.departedAt && recordedAt < trip.departedAt) ? { reason: "invalid_time", state: null }
    : quality ? { reason: quality, state: null }
    : recovering ? { reason: "confirming_signal", state: null }
    : filterFix({ latitude: body.latitude, longitude: body.longitude, recordedAt, accuracyMeters: accuracy, speedKph: speed }, previous ? {
      latitude: Number(previous.latitude), longitude: Number(previous.longitude), recordedAt: previous.recordedAt,
      accuracyMeters: Number(previous.accuracyMeters ?? 15), speedKph: previous.speedKph == null ? null : Number(previous.speedKph), variance: previous.filterVariance ?? 225,
    } : null);
  await db.deviceTelemetry.create({ data: {
    deviceId: device.deviceId, tripRequestId: trip?.id, recordedAt,
    hasFix: body.hasFix !== false, latitude: body.latitude, longitude: body.longitude,
    speedKph: speed, hdop: body.hdop, satellites: body.satellites, altitudeM: body.altitudeM,
    uptimeMs: body.uptimeMs == null ? undefined : BigInt(body.uptimeMs), acceleration: body.acceleration,
    sensorVersion: body.sensorVersion ?? 1, disposition: filtered.reason,
  } });
  const heartbeat = { deviceId: device.deviceId, vehicleId: device.vehicleId, lastSeenAt: now.toISOString() };
  // Resolve authorized recipients before commit so an auxiliary query failure
  // cannot lose the event for an already persisted report.
  const viewers = await db.tripRequest.findMany({
    where: { vehicleId: device.vehicleId, status: { in: ["ONGOING", "COMPLETED"] } },
    distinct: ["employeeId"], select: { employee: { select: { department: true } } },
  });
  const heartbeatDepartments = [...new Set(viewers.map((trip) => trip.employee.department))];
  if (!filtered.state || !trip) return { ok: true, recorded: false, reason: filtered.reason, heartbeat, heartbeatDepartments };
  const gps = await db.gpsPoint.create({
    data: {
      tripRequestId: trip.id,
      deviceId: body.deviceId,
      latitude: filtered.state.latitude,
      longitude: filtered.state.longitude,
      filterVersion: 1, filterVariance: filtered.state.variance,
      speedKph: speed,
      heading: body.heading,
      accuracyMeters: accuracy,
      recordedAt,
    },
  });
  const position = {
    id: gps.id.toString(),
    deviceId: gps.deviceId,
    latitude: Number(gps.latitude),
    longitude: Number(gps.longitude),
    speedKph: gps.speedKph === null ? null : Number(gps.speedKph),
    heading: gps.heading === null ? null : Number(gps.heading),
    accuracyMeters: gps.accuracyMeters === null ? null : Number(gps.accuracyMeters),
    recordedAt: gps.recordedAt.toISOString(),
  };
  return { ok: true, recorded: true, ticketNo: trip.id, department: trip.employee?.department, gps: { ...position, tripRequestId: trip.id }, heartbeat, heartbeatDepartments };
  }, { isolationLevel: "ReadCommitted" });
  emitGpsHeartbeat(result.heartbeat, result.heartbeatDepartments);
  if (result.gps && result.ticketNo) emitGpsPosition({ ticketId: result.ticketNo, gps: result.gps }, result.department);
  const { heartbeat: _heartbeat, heartbeatDepartments: _departments, ...response } = result;
  return response;
}
