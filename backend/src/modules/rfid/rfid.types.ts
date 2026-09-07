import { z } from "zod";
export const scanSchema = z.object({
  type: z.enum(["ticket", "movement"]).default("ticket"),
  timeoutMs: z.number().int().min(5000).max(60000).optional(),
  session: z.string().max(100).optional(),
});
export const cancelSchema = z.object({
  session: z.string().max(100).optional(),
});
export const normalizeUid = (value: unknown) =>
  String(value ?? "")
    .replace(/[^a-f0-9]/gi, "")
    .toUpperCase();
