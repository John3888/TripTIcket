import { ENV } from "../../config/env.js";
import * as s from "./gps.services.js";
import { devicePostHandler } from "./gps.http.js";
import { prisma } from "../../config/prismaClient.js";
import { AppError } from "../../middlewares/error.middleware.js";
import { saveDiagnostics } from "./gps.diagnostics.js";

export const record = devicePostHandler({ deviceKey: ENV.EMB_GPS_DEVICE_KEY, intervalMs: 1000, record: s.record });
export const diagnostics = devicePostHandler({
  deviceKey: ENV.EMB_GPS_DEVICE_KEY, intervalMs: 10000,
  record: async (body) => {
    const device = await prisma.trackingDevice.findUnique({ where: { deviceId: body.deviceId } });
    if (!device?.enabled) throw new AppError(403, "GPS device is not registered or is disabled.");
    saveDiagnostics(body.deviceId, body);
    return { ok: true };
  },
});
