import type { RequestHandler } from "express";
import * as service from "./rfid.services.js";
export const scan: RequestHandler = async (req, res) => {
  res.clearCookie("EMB_TTR_RFID_PROOF", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  const result = await service.scan(req.body);
  res.cookie("EMB_TTR_RFID_PROOF", result.rfidToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 300000,
  });
  res.json(result);
};
export const cancel: RequestHandler = async (req, res) => res.json(await service.cancel(req.body));
export const status: RequestHandler = async (_req, res) => res.json(await service.status());
export const receive: RequestHandler = async (req, res) =>
  res.json({
    success: true,
    data: service.receive(req.body?.uid ?? req.body?.rfid ?? req.body?.rfid_tag),
    capabilities: { read: true, write: false },
  });
export const heartbeat: RequestHandler = async (_req, res) =>
  res.json({
    success: true,
    data: service.heartbeat(),
    capabilities: { read: true, write: false },
  });
