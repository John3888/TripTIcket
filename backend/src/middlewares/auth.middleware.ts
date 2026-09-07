import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { ENV } from "../config/env.js";
import { canAccessStaffPage, isStaffRole, type StaffPage } from "../config/access-policy.js";
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const token = req.cookies?.EMB_TTR_SESSION;
  if (token) {
    try {
      req.auth = jwt.verify(token, ENV.JWT_SECRET) as Express.Request["auth"];
    } catch {}
  }
  next();
};
export const requireAuth: RequestHandler = (req, res, next) =>
  req.auth
    ? next()
    : void res.status(401).json({ ok: false, error: "Authentication is required." });
export const requireRole =
  (...roles: string[]): RequestHandler =>
  (req, res, next) => {
    if (!req.auth)
      return void res.status(401).json({ ok: false, error: "Authentication is required." });
    return roles.includes(req.auth.role)
      ? next()
      : void res.status(403).json({
          ok: false,
          error: "You do not have permission to perform this action.",
        });
  };

export const requireDepartment =
  (...departments: string[]): RequestHandler =>
  (req, res, next) => {
    if (!req.auth)
      return void res.status(401).json({ ok: false, error: "Authentication is required." });
    return departments.includes(req.auth.department)
      ? next()
      : void res.status(403).json({
          ok: false,
          error: "Your department does not have permission to perform this action.",
        });
  };

export const requireStaff: RequestHandler = (req, res, next) => {
  if (!req.auth)
    return void res.status(401).json({ ok: false, error: "Authentication is required." });
  return isStaffRole(req.auth.role)
    ? next()
    : void res.status(403).json({
        ok: false,
        error: "A staff operations role is required for this resource.",
      });
};

export const requireStaffPage =
  (page: StaffPage): RequestHandler =>
  (req, res, next) => {
    if (!req.auth)
      return void res.status(401).json({ ok: false, error: "Authentication is required." });
    return canAccessStaffPage(req.auth, page)
      ? next()
      : void res.status(403).json({
          ok: false,
          error: "Your role or department does not have access to this operations page.",
        });
  };
