import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { AppError } from "../../middlewares/error.middleware.js";

function harness(initialStatus = "ONGOING") {
  const actor = { employeeId: "EMP-1", rfidUid: "CARD-1", name: "Test", role: "Requester", department: "IT" };
  const vehicle = { vehicleId: "CAR-1", plate: "ABC", status: initialStatus === "ONGOING" ? "ON_TRIP" : "STANDBY" };
  const requests = new Map<string, any>([["000001", { id: "000001", employeeId: actor.employeeId,
    vehicleId: vehicle.vehicleId, status: initialStatus, employee: { department: "IT" }, departedAt: new Date() }]]);
  const db = {
    $queryRaw: async () => [],
    employee: { findUnique: async () => ({ ...actor, status: "ACTIVE" }) },
    notification: { create: async ({ data }: any) => data },
    vehicle: {
      findUnique: async () => ({ ...vehicle }),
      update: async ({ data }: any) => Object.assign(vehicle, data),
      updateMany: async ({ where, data }: any) => {
        if (vehicle.status !== where.status) return { count: 0 };
        Object.assign(vehicle, data); return { count: 1 };
      },
    },
    tripRequest: {
      findUnique: async ({ where }: any) => requests.get(where.id),
      findFirst: async ({ where }: any) => where?.status === "ONGOING"
        ? [...requests.values()].find((trip) => trip.status === "ONGOING" && trip.id !== where.id?.not) ?? null
        : [...requests.values()].at(-1),
      create: async ({ data }: any) => {
        const trip = { ...data, status: "PENDING", employee: { department: "IT" } }; requests.set(data.id, trip); return trip;
      },
      update: async ({ where, data }: any) => Object.assign(requests.get(where.id), data),
    },
  };
  const imports: Record<string, unknown> = {
    jsonwebtoken: { default: { verify: () => ({ ...actor, purpose: "rfid-kiosk" }) }, __esModule: true },
    "../../config/prismaClient.js": { prisma: { $transaction: async (fn: any) => fn(db) } },
    "../../config/env.js": { ENV: { JWT_SECRET: "test" } },
    "../../middlewares/error.middleware.js": { AppError },
    "./request.approval-policy.js": { getApprovalActions: () => [], getApprovalUpdate: () => ({}) },
    "./request.timing.js": { tripTiming: () => ({ elapsedSeconds: 60, flagged: true }) },
  };
  const evaluated = { exports: {} as Record<string, any> };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("request.services.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: evaluated.exports, require: (name: string) => {
    assert.ok(name in imports, `Unexpected dependency ${name}`); return imports[name];
  } });
  return { ...evaluated.exports, requests, vehicle, actor } as any;
}

const request = { rfidToken: "proof", plate: "ABC", destination: "Office", purpose: "Work", days: 0, hours: 1, minutes: 0 };

test("closing even an overdue trip releases the vehicle for a new request and departure", async () => {
  const h = harness();
  await h.processTripRequestAction("000001", { action: "complete" }, h.actor);
  assert.equal(h.vehicle.status, "STANDBY");
  assert.equal(h.requests.get("000001").status, "COMPLETED");
  assert.equal(h.requests.get("000001").flagged, true);
  const created = await h.createTripRequest(request);
  assert.equal(created.request.vehicleId, "CAR-1"); assert.equal(created.request.status, "PENDING");
  created.request.status = "APPROVED";
  await h.processTripRequestAction(created.request.id, { action: "start" }, h.actor);
  assert.equal(h.vehicle.status, "ON_TRIP"); assert.equal(created.request.status, "ONGOING");
});

test("a vehicle with an ongoing trip cannot be requested even if its standby flag is inconsistent", async () => {
  const h = harness(); h.vehicle.status = "STANDBY";
  await assert.rejects(h.createTripRequest(request), (error: any) => error.status === 409);
  assert.equal(h.requests.size, 1);
});

test("concurrent departures for two approved tickets claim the standby vehicle only once", async () => {
  const h = harness("APPROVED");
  h.requests.set("000002", { ...h.requests.get("000001"), id: "000002" });
  const results = await Promise.allSettled(["000001", "000002"].map((id) =>
    h.processTripRequestAction(id, { action: "start" }, h.actor)));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal([...h.requests.values()].filter((trip: any) => trip.status === "ONGOING").length, 1);
});
