import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import * as c from "./account.controller.js";
const r = Router();
r.use(requireAuth);
r.patch("/email", c.email);
r.patch("/password", c.password);
r.patch("/notifications", c.notifications);
export default r;
