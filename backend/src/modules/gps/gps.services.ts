import { prisma } from "../../config/prismaClient.js";
import { AppError } from "../../middlewares/error.middleware.js";
import { emitGpsPosition } from "../../realtime.js";
export async function record(body: any) {
  const trip = await prisma.tripRequest.findFirst({
    where: {
      OR: [
        body.ticketNo ? { id: body.ticketNo } : undefined,
        body.id ? { id: body.id } : undefined,
        body.plate ? { vehicle: { plate: body.plate }, status: "ONGOING" } : undefined,
      ].filter(Boolean) as any,
    },
  });
  if (!trip) throw new AppError(404, "Active trip ticket was not found.");
  const gps = await prisma.gpsPoint.create({
    data: {
      tripRequestId: trip.id,
      deviceId: body.deviceId,
      latitude: body.latitude,
      longitude: body.longitude,
      speedKph: body.speedKph,
      heading: body.heading,
      accuracyMeters: body.accuracyMeters,
      recordedAt: body.recordedAt || new Date(),
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
  emitGpsPosition({ ticketId: trip.id, gps: position });
  return { ok: true, ticketNo: trip.id, gps: { ...position, tripRequestId: trip.id } };
}
