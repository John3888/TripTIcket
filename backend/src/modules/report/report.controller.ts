import type { RequestHandler } from "express";
import { printThermalReceipt } from "./thermal-printer.js";
import * as s from "./report.services.js";
export const csv: RequestHandler = async (req, res) => {
  if (!req.auth)
    throw new Error("Authenticated staff context was not available.");
  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader(
    "content-disposition",
    'attachment; filename="EMB_Trip_Tickets.csv"',
  );
  res.send(await s.requestCsv(req.auth));
};
export const receipt: RequestHandler = async (req, res) =>
  res.json({
    ok: true,
    receipt: await s.receipt(String(req.params.id), req.auth),
  });
export const printReceipt: RequestHandler = async (req, res) => {
  const receipt = await s.receipt(String(req.params.id), req.auth);
  res.json({ ok: true, receipt, ...(await printThermalReceipt(receipt)) });
};
