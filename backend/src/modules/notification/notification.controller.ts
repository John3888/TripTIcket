import type { RequestHandler } from "express";
import * as s from "./notification.services.js";
import { publicStore } from "../store/store.services.js";
export const one: RequestHandler = async (req, res) => {
  if (!req.auth) throw new Error("Authentication is required.");
  await s.update(String(req.params.id), req.body.action, req.auth);
  res.json(await publicStore({ actor: req.auth, page: "pending" }));
};
export const all: RequestHandler = async (req, res) => {
  if (!req.auth) throw new Error("Authentication is required.");
  await s.updateAll(req.body.action, req.auth);
  res.json(await publicStore({ actor: req.auth, page: "pending" }));
};
export const clear: RequestHandler = async (req, res) => {
  if (!req.auth) throw new Error("Authentication is required.");
  await s.clear(req.auth);
  res.json(await publicStore({ actor: req.auth, page: "pending" }));
};
