import type { RequestHandler } from "express";
import * as s from "./account-registry.services.js";
export const register: RequestHandler = async (req, res) => res.json(await s.register(req.body));
export const scan: RequestHandler = async (req, res) => res.json(await s.scan(req.body));
export const unassigned: RequestHandler = async (_req, res) => res.json(await s.unassigned());
export const employees: RequestHandler = async (_req, res) => res.json(await s.employees());
export const createAccount: RequestHandler = async (req, res) =>
  res.json(await s.createAccount(req.body));
export const assignCard: RequestHandler = async (req, res) =>
  res.json(await s.assignCard(req.body));
export const updateEmployee: RequestHandler = async (req, res) =>
  res.json(await s.updateEmployee(String(req.params.employeeId), req.body));
