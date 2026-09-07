import { Router } from "express";
import { requireAuth, requireStaff } from "../../middlewares/auth.middleware.js";
import * as c from "./report.controller.js";
const r = Router();
r.use(requireAuth, requireStaff);
r.get("/requests.csv", c.csv);
r.get("/receipt/:id", c.receipt);
export default r;
