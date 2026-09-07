import { Router } from "express";
import { requireAuth, requireStaff } from "../../middlewares/auth.middleware.js";
import * as c from "./notification.controller.js";
const r = Router();
r.use(requireAuth, requireStaff);
r.patch("/:id", c.one);
r.patch("/", c.all);
r.delete("/", c.clear);
export default r;
