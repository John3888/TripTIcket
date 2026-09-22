import "dotenv/config";
import { z } from "zod";
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(5001),
  FRONTEND_URL: z.string().url().default("https://tripticket.jgccorporatesolutions.com"),
  FRONTEND_LAN_URL: z.string().url().optional().or(z.literal("")),
  JWT_SECRET: z.string().min(24),
  JWT_EXPIRES_IN: z.string().default("1d"),
  EMB_GPS_DEVICE_KEY: z.string().default(""),
  OSRM_URL: z.string().url().default("http://127.0.0.1:5003"),
  EMB_ESP32_TIMEOUT_MS: z.coerce.number().int().positive().default(65000),
  EMB_ESP32_HEARTBEAT_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  EMB_ESP32_API_KEY: z.string().default(""),
});
export const ENV = schema.parse(process.env);
