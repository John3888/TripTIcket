import { z } from "zod";
export const loginSchema = z
  .object({
    username: z.string().email().optional(),
    email: z.string().email().optional(),
    password: z.string().min(1),
  })
  .refine((v) => v.username || v.email, { message: "Email is required." });
