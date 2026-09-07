import type { RequestHandler } from "express";
import { canAccessStaffPage, isStaffPage } from "../../config/access-policy.js";
import { publicStore, kioskStore } from "./store.services.js";
import { AppError } from "../../middlewares/error.middleware.js";

export const getStore: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, "Authentication is required.");
  const requestedPage = String(req.query.page || "pending");
  if (!isStaffPage(requestedPage)) throw new AppError(400, "Unknown operations page.");
  if (!canAccessStaffPage(req.auth, requestedPage))
    throw new AppError(
      403,
      "Your role or department does not have access to this operations page.",
    );
  res.json(await publicStore({ actor: req.auth, page: requestedPage }));
};

export const getKioskStore: RequestHandler = async (_req, res) => res.json(await kioskStore());
