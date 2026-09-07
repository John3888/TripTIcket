import { z } from "zod";
export const gpsSchema = z.object({
  ticketNo: z.string().optional(),
  id: z.string().optional(),
  plate: z.string().optional(),
  deviceId: z.string().optional(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  speedKph: z.coerce.number().min(0).optional(),
  heading: z.coerce.number().min(0).max(360).optional(),
  accuracyMeters: z.coerce.number().min(0).optional(),
  recordedAt: z.coerce.date().optional(),
  deviceKey: z.string().optional(),
});
