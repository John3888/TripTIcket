import { Router } from "express";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { validateBody } from "../../middlewares/validate.middleware.js";
import {
  registerSchema,
  createAccountSchema,
  assignCardSchema,
  updateEmployeeSchema,
} from "./account-registry.validation.js";
import * as c from "./account-registry.controller.js";
const r = Router();
r.use(requireAuth, requireRole("Administrator"));
r.get("/unassigned", c.unassigned);
r.get("/employees", c.employees);
r.post("/scan", c.scan);
r.post("/accounts", validateBody(createAccountSchema), c.createAccount);
r.post("/assign", validateBody(assignCardSchema), c.assignCard);
r.patch("/employees/:employeeId", validateBody(updateEmployeeSchema), c.updateEmployee);
r.post("/", validateBody(registerSchema), c.register);
export default r;
