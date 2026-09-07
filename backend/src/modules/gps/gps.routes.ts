import { Router } from "express";
import { validateBody } from "../../middlewares/validate.middleware.js";
import { gpsSchema } from "./gps.validation.js";
import { record } from "./gps.controller.js";
const r = Router();
r.post("/position", validateBody(gpsSchema), record);
export default r;
