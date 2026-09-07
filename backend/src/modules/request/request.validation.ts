import { z } from "zod";
export const createRequestSchema = z.object({
  employee: z.string().min(1).optional(),
  plate: z.string().min(1),
  destination: z.string().min(1),
  purpose: z.string().min(1),
  days: z.coerce.number().int().min(0).default(0),
  hours: z.coerce.number().int().min(0).default(0),
  minutes: z.coerce.number().int().min(0).max(59).default(0),
  rfidToken: z.string().min(1),
});
export const actionSchema = z.object({
  action: z.enum(["note", "approve", "deny", "start", "complete"]),
  rfidToken: z.string().optional(),
});
