import type { RequestHandler } from "express";
import { ENV } from "../../config/env.js";
import * as s from "./gps.services.js";
export const record: RequestHandler = async (req, res) => {
  const key = String(req.headers["x-emb-gps-key"] || req.body.deviceKey || "");
  if (ENV.EMB_GPS_DEVICE_KEY && key !== ENV.EMB_GPS_DEVICE_KEY) {
    res.status(403).json({ ok: false, error: "GPS device is not authorized." });
    return;
  }
console.log("Content-Type:", req.headers["content-type"]);
console.log("Body type:", typeof req.body);
console.log("Body keys:", Object.keys(req.body ?? {}));

res.json(await s.record(req.body));
  
};
