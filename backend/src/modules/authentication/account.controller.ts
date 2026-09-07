import type { RequestHandler } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../../config/prismaClient.js";
import { AppError } from "../../middlewares/error.middleware.js";
export const email: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, "Authentication is required.");
  const value = String(req.body.email || "")
    .trim()
    .toLowerCase();
  if (!value.includes("@")) throw new AppError(400, "A valid email is required.");
  await prisma.employee.update({
    where: { employeeId: req.auth.employeeId },
    data: { email: value },
  });
  res.json({ ok: true, email: value });
};
export const password: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, "Authentication is required.");
  const user = await prisma.user.findUnique({
    where: { userId: req.auth.userId },
  });
  if (!user || !(await bcrypt.compare(String(req.body.currentPassword || ""), user.passwordHash)))
    throw new AppError(400, "Current password is incorrect.");
  const value = String(req.body.newPassword || "");
  if (value.length < 8) throw new AppError(400, "New password must contain at least 8 characters.");
  await prisma.user.update({
    where: { userId: user.userId },
    data: { passwordHash: await bcrypt.hash(value, 12) },
  });
  res.json({ ok: true });
};
export const notifications: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, "Authentication is required.");
  const mode = String(req.body.notificationMode || req.body.mode || "").toUpperCase();
  if (!["ON", "SILENT", "OFF"].includes(mode))
    throw new AppError(400, "Invalid notification mode.");
  await prisma.user.update({
    where: { userId: req.auth.userId },
    data: { notificationMode: mode as any },
  });
  res.json({ ok: true, notificationMode: mode.toLowerCase() });
};
