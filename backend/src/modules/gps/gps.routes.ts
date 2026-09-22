import { Router } from "express";
import { validateBody } from "../../middlewares/validate.middleware.js";
import { gpsSchema } from "./gps.validation.js";
import { record } from "./gps.controller.js";
import { requireAuth, requireStaffPage } from "../../middlewares/auth.middleware.js";
import { tripTrack } from "./gps.track.js";
const r = Router();
r.post("/position", validateBody(gpsSchema), record);
r.post("/", validateBody(gpsSchema), record);
r.get("/trips/:id/track", requireAuth, requireStaffPage("live-gps"), async (req, res) => {
  res.json(await tripTrack(String(req.params.id), req.auth!));
});
export default r;
