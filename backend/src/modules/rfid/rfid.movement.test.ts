import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import jwt from "jsonwebtoken";

process.env.DATABASE_URL = "mysql://test:test@127.0.0.1:1/movement_test";
process.env.JWT_SECRET = "movement-test-secret-not-for-production";
const { prisma } = await import("../../config/prismaClient.js");
const { scan } = await import("./rfid.services.js");
const { receiveDeviceUid } = await import("./rfid.device-client.js");
const { processTripRequestAction } = await import("../request/request.services.js");

function replaceMethod(
  context: TestContext,
  target: any,
  key: string,
  implementation: (...args: any[]) => any,
) {
  const original = target[key];
  const replacement = context.mock.fn(implementation);
  target[key] = replacement;
  context.after(() => {
    target[key] = original;
  });
  return replacement;
}

const employee = {
  employeeId: "EMP-1",
  displayName: "Employee with a shared name",
  role: "Employee",
  department: "OPERATIONS",
  status: "ACTIVE",
  user: null,
};

test("Movement scan queries approved and ongoing tickets by the verified employee ID", async (context) => {
  replaceMethod(context, prisma.employee, "findUnique", async () => employee);
  replaceMethod(context, prisma.tripRequest, "findMany", async (query: any) => {
    assert.deepEqual(query.where, {
      employeeId: "EMP-1",
      status: { in: ["APPROVED", "ONGOING"] },
    });
    assert.equal(query.select.employee, undefined);
    return ["APPROVED", "ONGOING"].map((status, index) => ({
      id: `TRIP-${index}`,
      status,
      destination: "Office",
      requestedAt: new Date("2026-09-07T08:00:00Z"),
      departedAt: status === "ONGOING" ? new Date(Date.now() - 65000) : null,
      arrivedAt: null,
      elapsedSeconds: 0,
      vehicle: { plate: "TEST-123" },
    }));
  });
  const pendingScan = scan({ type: "movement", session: "movement-test" });
  receiveDeviceUid("A001");
  const result = await pendingScan;
  assert.ok("movementTickets" in result);
  assert.deepEqual(
    result.movementTickets?.map((ticket) => ticket.status),
    ["approved", "ongoing"],
  );
  assert.equal(result.movementTickets?.[0]?.plate, "TEST-123");
  assert.ok((result.movementTickets?.[1]?.elapsedSeconds || 0) >= 65);
});

test("Empty movement results are returned as an empty list", async (context) => {
  replaceMethod(context, prisma.employee, "findUnique", async () => employee);
  replaceMethod(context, prisma.tripRequest, "findMany", async () => []);
  const pendingScan = scan({ type: "movement", session: "empty-test" });
  receiveDeviceUid("A002");
  const result = await pendingScan;
  assert.ok("movementTickets" in result);
  assert.deepEqual(result.movementTickets, []);
});

test("Inactive cards cannot fetch movement tickets", async (context) => {
  replaceMethod(context, prisma.employee, "findUnique", async () => ({
    ...employee,
    status: "INACTIVE",
  }));
  const findTickets = replaceMethod(context, prisma.tripRequest, "findMany", async () => []);
  const pendingScan = scan({ type: "movement", session: "inactive-test" });
  receiveDeviceUid("A003");
  await assert.rejects(pendingScan, /inactive/);
  assert.equal(findTickets.mock.callCount(), 0);
});

test("Request scans do not fetch or expose movement tickets", async (context) => {
  replaceMethod(context, prisma.employee, "findUnique", async () => employee);
  const findTickets = replaceMethod(context, prisma.tripRequest, "findMany", async () => []);
  const pendingScan = scan({ type: "ticket", session: "request-test" });
  receiveDeviceUid("A004");
  const result = await pendingScan;
  assert.equal("movementTickets" in result, false);
  assert.equal(findTickets.mock.callCount(), 0);
});

test("Scanned owner can depart and arrive even with a different staff account logged in", async (context) => {
  let ticket: any = {
    id: "TRIP-1",
    employeeId: employee.employeeId,
    employee: { department: employee.department },
    vehicleId: "VEHICLE-1",
    status: "APPROVED",
    estimatedSeconds: 3600,
    flagged: false,
    elapsedSeconds: 0,
  };
  const vehicleStatuses: string[] = [];
  const transaction = {
    tripRequest: {
      findUnique: async () => ticket,
      update: async ({ data }: any) => (ticket = { ...ticket, ...data }),
    },
    vehicle: {
      update: async ({ data }: any) => {
        vehicleStatuses.push(data.status);
      },
    },
    notification: { create: async ({ data }: any) => data },
  };
  replaceMethod(context, prisma, "$transaction", async (callback: any) => callback(transaction));
  const staff = {
    employeeId: "OTHER-EMPLOYEE",
    name: "Logged-in HR head",
    role: "HR Head",
    department: "HUMAN_RESOURCES",
  };
  const proof = (employeeId: string) =>
    jwt.sign(
      {
        purpose: "rfid-kiosk",
        employeeId,
        name: employee.displayName,
        role: employee.role,
        department: employee.department,
      },
      process.env.JWT_SECRET!,
      { expiresIn: "5m" },
    );
  await assert.rejects(
    processTripRequestAction(
      ticket.id,
      { action: "start", rfidToken: proof("WRONG-OWNER") },
      staff,
    ),
    /not allowed/,
  );
  assert.equal(ticket.status, "APPROVED");
  const rfidToken = proof(employee.employeeId);
  const departure = await processTripRequestAction(
    ticket.id,
    { action: "start", rfidToken },
    staff,
  );
  assert.equal(departure.request.status, "ONGOING");
  assert.ok(departure.request.departedAt instanceof Date);
  await assert.rejects(
    processTripRequestAction(ticket.id, { action: "start", rfidToken }, staff),
    /not allowed/,
  );
  ticket.departedAt = new Date(Date.now() - 125000);
  const arrival = await processTripRequestAction(
    ticket.id,
    { action: "complete", rfidToken },
    staff,
  );
  assert.equal(arrival.request.status, "COMPLETED");
  assert.ok(arrival.request.arrivedAt instanceof Date);
  assert.ok(arrival.request.elapsedSeconds >= 125);
  assert.deepEqual(vehicleStatuses, ["ON_TRIP", "STANDBY"]);
  assert.equal(arrival.notifications[0]?.kind, "completed");
});
