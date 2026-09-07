import type { RequestHandler } from "express";
import * as s from "./report.services.js";
export const csv: RequestHandler = async (req, res) => {
  if (!req.auth) throw new Error("Authenticated staff context was not available.");
  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader("content-disposition", 'attachment; filename="EMB_Trip_Tickets.csv"');
  res.send(await s.requestCsv(req.auth));
};
export const receipt: RequestHandler = async (req, res) =>
  res.json({ ok: true, receipt: await s.receipt(String(req.params.id), req.auth) });
