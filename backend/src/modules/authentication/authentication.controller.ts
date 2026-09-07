import type { RequestHandler } from "express";
import * as service from "./authentication.service.js";
export const login: RequestHandler = async (req, res) => {
  const result = await service.login(req.body.email || req.body.username, req.body.password);
  res
    .cookie("EMB_TTR_SESSION", result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 86400000,
    })
    .json({ ok: true, user: result.user });
};
export const session: RequestHandler = (req, res) => res.json({ ok: true, user: req.auth });
export const logout: RequestHandler = (_req, res) => {
  res.clearCookie("EMB_TTR_SESSION").json({ ok: true });
};
