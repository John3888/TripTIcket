import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import jwt from "jsonwebtoken";

process.env.DATABASE_URL = "mysql://test:test@127.0.0.1:1/registration_test";
process.env.JWT_SECRET = "registration-test-secret-not-for-production";
const { prisma } = await import("../../config/prismaClient.js");
const { scan } = await import("./rfid.services.js");
const { scan: scanController } = await import("./rfid.controller.js");
const { scan: registrationScan } = await import("../account-registry/account-registry.services.js");
const { receiveDeviceUid } = await import("./rfid.device-client.js");
const { createTripRequest } = await import("../request/request.services.js");

function replaceMethod(context: TestContext, target: any, key: string, implementation: any) {
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
  rfidUid: "A101",
  displayName: "Registered Employee",
  role: "Employee",
  department: "OPERATIONS",
  status: "ACTIVE",
  user: null,
};
const requestInput = {
  plate: "TEST-123",
  destination: "Office",
  purpose: "Meeting",
  days: 0,
  hours: 1,
  minutes: 0,
};
function proof(rfidUid: string | undefined = employee.rfidUid) {
  return jwt.sign(
    {
      purpose: "rfid-kiosk",
      employeeId: employee.employeeId,
      rfidUid,
      name: employee.displayName,
      role: employee.role,
      department: employee.department,
    },
    process.env.JWT_SECRET!,
    { expiresIn: "5m" },
  );
}

for (const [index, type] of ["ticket", "movement"].entries()) {
  test(`Unregistered cards are rejected during ${type} scans`, async (context) => {
    replaceMethod(context, prisma.employee, "findUnique", async () => null);
    const pending = scan({ type, session: `unregistered-${type}` });
    receiveDeviceUid(`B10${index}`);
    await assert.rejects(pending, { status: 403, message: /not registered/ });
  });
}

test("An unsuccessful scan clears the previous card proof cookie", async (context) => {
  replaceMethod(context, prisma.employee, "findUnique", async () => null);
  const clearCookie = context.mock.fn();
  const cookie = context.mock.fn();
  const json = context.mock.fn();
  const pending = scanController(
    { body: { type: "ticket", session: "cookie-test" } } as any,
    { clearCookie, cookie, json } as any,
    () => {},
  );
  receiveDeviceUid("B102");
  await assert.rejects(Promise.resolve(pending), { status: 403 });
  assert.equal(clearCookie.mock.calls[0]?.arguments[0], "EMB_TTR_RFID_PROOF");
  assert.equal(cookie.mock.callCount(), 0);
  assert.equal(json.mock.callCount(), 0);
});

test("Inactive employee cards cannot pass the ticket scan", async (context) => {
  replaceMethod(context, prisma.employee, "findUnique", async () => ({
    ...employee,
    status: "INACTIVE",
  }));
  const pending = scan({ type: "ticket", session: "inactive-test" });
  receiveDeviceUid("B103");
  await assert.rejects(pending, { status: 403, message: /inactive/ });
});

test("Unregistered cards remain available for administrator registration", async (context) => {
  replaceMethod(context, prisma.employee, "findUnique", async () => null);
  const pending = registrationScan({ session: "registration-test" });
  receiveDeviceUid("B104");
  const result = await pending;
  assert.equal(result.available, true);
  assert.equal(result.uid, "B104");
  assert.equal(result.existing, null);
});

for (const [name, currentEmployee, rfidToken] of [
  ["missing proof", employee, ""],
  ["invalid proof", employee, "invalid-token"],
  ["removed employee", null, proof()],
  ["unassigned card", { ...employee, rfidUid: null }, proof()],
  ["replaced card", { ...employee, rfidUid: "A999" }, proof()],
  ["inactive employee", { ...employee, status: "INACTIVE" }, proof()],
  ["proof without a card UID", employee, proof("")],
] as const) {
  test(`Request submission rejects ${name} without creating records`, async (context) => {
    const create = context.mock.fn();
    const vehicleLookup = context.mock.fn();
    replaceMethod(context, prisma, "$transaction", async (run: any) =>
      run({
        employee: { findUnique: async () => currentEmployee },
        vehicle: { findUnique: vehicleLookup },
        tripRequest: { create },
        notification: { create },
      }),
    );
    await assert.rejects(
      createTripRequest({ ...requestInput, rfidToken }),
      (error: any) => error.status === 401 || error.status === 403,
    );
    assert.equal(create.mock.callCount(), 0);
    assert.equal(vehicleLookup.mock.callCount(), 0);
  });
}

test("An active registered card can scan and submit a trip request", async (context) => {
  replaceMethod(context, prisma.employee, "findUnique", async (query: any) => {
    assert.equal(query.where.rfidUid, employee.rfidUid);
    return employee;
  });
  const pending = scan({ type: "ticket", session: "registered-test" });
  receiveDeviceUid(employee.rfidUid);
  const result = await pending;
  const claims = jwt.verify(result.rfidToken, process.env.JWT_SECRET!) as jwt.JwtPayload;
  assert.equal(claims.rfidUid, employee.rfidUid);
  const create = context.mock.fn(async ({ data }: any) => data);
  replaceMethod(context, prisma, "$transaction", async (run: any) =>
    run({
      employee: { findUnique: async () => employee },
      vehicle: { findUnique: async () => ({ vehicleId: "V-1", status: "STANDBY" }) },
      tripRequest: { findFirst: async () => null, create },
      notification: { create: async ({ data }: any) => data },
    }),
  );
  const created = await createTripRequest({ ...requestInput, rfidToken: result.rfidToken });
  assert.equal(created.request.employeeId, employee.employeeId);
  assert.equal(created.request.id, "000001");
  assert.equal(create.mock.callCount(), 1);
});
