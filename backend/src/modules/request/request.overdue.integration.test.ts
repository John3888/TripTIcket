import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

process.env.DATABASE_URL = "mysql://test:test@127.0.0.1:1/overdue_test";
process.env.JWT_SECRET = "overdue-test-secret-not-for-production";
const { prisma } = await import("../../config/prismaClient.js");
const { publicStore, kioskStore } = await import("../store/store.services.js");
const { requestCsv, receipt } = await import("../report/report.services.js");

function replaceMethod(context: TestContext, target: any, key: string, implementation: any) {
  const original = target[key];
  target[key] = context.mock.fn(implementation);
  context.after(() => { target[key] = original; });
}

const lateTrip = {
  id: "000001",
  status: "ONGOING",
  requestedAt: new Date("2026-09-07T07:00:00Z"),
  employee: { displayName: "Test Employee", role: "Employee", department: "OPERATIONS" },
  vehicle: { plate: "TEST-123" },
  destination: "Test office",
  purpose: "Private purpose",
  estimatedSeconds: 3600,
  elapsedSeconds: 0,
  departedAt: new Date("2026-09-07T08:00:00Z"),
  arrivedAt: null,
  flagged: false,
};

test("Staff and kiosk expose current overdue flags without relying on a saved flag", async (context) => {
  for (const model of [prisma.employee, prisma.vehicle, prisma.user, prisma.workflowStep, prisma.notification]) {
    replaceMethod(context, model, "findMany", async () => []);
  }
  replaceMethod(context, prisma.tripRequest, "findMany", async () => [lateTrip]);
  const staff = await publicStore({ actor: { userId: "TEST", employeeId: "TEST", name: "Test Admin", role: "Administrator", department: "MIS" }, page: "outgoing" });
  const kiosk = await kioskStore();
  for (const row of [staff.outgoing[0]!, kiosk.outgoing[0]!]) {
    assert.equal(row.flagged, true);
    assert.equal(row.isOverdue, true);
    assert.ok(row.overdueSeconds > 0);
    assert.equal(row.estimatedSeconds, 3600);
    assert.equal(row.expectedReturnAt, "2026-09-07T09:00:00.000Z");
    assert.equal(row.createdAt, lateTrip.requestedAt.toISOString());
  }
  assert.equal(kiosk.outgoing[0]!.requestedBy, "Employee");
  assert.equal(kiosk.outgoing[0]!.purpose, "");
  assert.equal(lateTrip.flagged, false);
});

test("CSV and receipts retain late completion flags and frozen overrun", async (context) => {
  const completed = { ...lateTrip, status: "COMPLETED", arrivedAt: new Date("2026-09-07T09:02:03Z") };
  replaceMethod(context, prisma.tripRequest, "findMany", async () => [completed]);
  replaceMethod(context, prisma.tripRequest, "findUnique", async () => completed);
  const report = await receipt(completed.id, undefined);
  assert.equal(report.flagged, true);
  assert.equal(report.elapsedSeconds, 3723);
  assert.equal(report.overdueSeconds, 123);
  const csv = await requestCsv(undefined);
  const [header, row] = csv.split("\r\n").map((line) => line!.split(",").map((cell) => cell.replaceAll('"', "")));
  assert.equal(row![header!.indexOf("Flagged")], "Yes");
  assert.equal(row![header!.indexOf("OverdueSeconds")], "123");
  assert.equal(row![header!.indexOf("ExpectedReturnAt")], "2026-09-07T09:00:00.000Z");
  await assert.rejects(receipt(completed.id, { role: "Department Head", department: "MIS" }), /another department/);
});
