import { z } from "zod";
export const gpsSchema = z.object({
  ticketNo: z.string().optional(),
  id: z.string().optional(),
  plate: z.string().optional(),
  deviceId: z.string().regex(/^[\w-]{1,80}$/),
  altitudeM: z.number().min(-20000).max(100000).nullable().optional(),
  satellites: z.number().int().min(0).max(1000).nullable().optional(),
  uptimeMs: z.number().int().min(0).max(4294967295).optional(),
  sensorVersion: z.literal(1).optional(),
  acceleration: z.object({
    x: z.number().min(-2000).max(2000), y: z.number().min(-2000).max(2000), z: z.number().min(-2000).max(2000),
    units: z.literal("m/s2"), frame: z.enum(["device", "vehicle"]),
  }).optional(),
  hasFix: z.boolean().default(true),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  speedKph: z.number().min(0).max(300).nullable().optional(),
  speedKmph: z.number().min(0).max(300).nullable().optional(),
  heading: z.number().min(0).max(360).nullable().optional(),
  accuracyMeters: z.number().min(0).max(999999).nullable().optional(),
  hdop: z.number().min(0).nullable().optional(),
  recordedAt: z.coerce.date().optional(),
  deviceKey: z.string().optional(),
}).superRefine((body, ctx) => {
  if (body.hasFix && (body.latitude == null || body.longitude == null))
    ctx.addIssue({ code: "custom", message: "A valid fix requires latitude and longitude" });
  if (!body.deviceId && !body.plate && !body.ticketNo && !body.id)
    ctx.addIssue({ code: "custom", message: "A device or trip identifier is required" });
});
