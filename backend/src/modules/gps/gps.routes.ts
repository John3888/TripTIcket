import { Router } from "express";
import { validateBody } from "../../middlewares/validate.middleware.js";
import { gpsSchema } from "./gps.validation.js";
import { record } from "./gps.controller.js";
import { requireAuth, requireStaffPage, requireRole } from "../../middlewares/auth.middleware.js";
import { tripTrack } from "./gps.track.js";
import { readDiagnostics } from "./gps.diagnostics.js";
const r = Router();
r.get("/diagnostics", requireAuth, requireRole("Administrator"), (req, res) => {
  res.json({ devices: readDiagnostics(typeof req.query.deviceId === "string" ? req.query.deviceId : undefined) });
});
r.post("/position", validateBody(gpsSchema), record);
r.post("/", validateBody(gpsSchema), record);
r.get("/trips/:id/track", requireAuth, requireStaffPage("live-gps"), async (req, res) => {
  res.json(await tripTrack(String(req.params.id), req.auth!));
});
export default r;
