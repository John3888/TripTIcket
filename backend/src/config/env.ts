import "dotenv/config";
import { z } from "zod";
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive(),
  FRONTEND_URL: z
    .string()
    .url()
    .default("https://tripticket.jgccorporatesolutions.com"),
  FRONTEND_LAN_URL: z.string().url().optional().or(z.literal("")),
  JWT_SECRET: z.string().min(24),
  JWT_EXPIRES_IN: z.string().default("1d"),
  EMB_GPS_DEVICE_KEY: z.string().default(""),
  OSRM_URL: z.string().url().default("http://127.0.0.1:5000"),
  GPS_INACTIVE_TIMEOUT_MS: z.coerce.number().int().min(120000).default(180000),
  GPS_TRAIL_MIN_METERS: z.coerce.number().positive().default(15),
  EMB_ESP32_TIMEOUT_MS: z.coerce.number().int().positive().default(65000),
  EMB_ESP32_HEARTBEAT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15000),
  EMB_ESP32_API_KEY: z.string().default(""),
  EMB_RECEIPT_PRINTER: z.string().default(""),
  EMB_RECEIPT_HOST: z.string().default(""),
  EMB_RECEIPT_PORT: z.coerce.number().int().min(1).max(65535).default(9100),
  EMB_RECEIPT_WIDTH_DOTS: z.coerce
    .number()
    .int()
    .min(384)
    .max(832)
    .multipleOf(8)
    .default(576),
  EMB_PRINT_BROWSER_PATH: z.string().default(""),
  EMB_PRINT_NO_SANDBOX: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});
export const ENV = schema.parse(process.env);
