import { Router } from "express";
import { getKioskStore, getStore } from "./store.controller.js";
import { requireAuth, requireStaff } from "../../middlewares/auth.middleware.js";
const router = Router();
router.get("/", requireAuth, requireStaff, getStore);
router.get("/kiosk", getKioskStore);
export default router;
