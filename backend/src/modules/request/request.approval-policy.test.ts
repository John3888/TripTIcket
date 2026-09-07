import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getApprovalActions,
  getApprovalUpdate,
  type ApprovalActor,
  type ApprovalRequest,
} from "./request.approval-policy.js";

const actionTime = new Date("2026-09-07T08:00:00Z");
const hr: ApprovalActor = {
  employeeId: "HR-HEAD",
  name: "HR reviewer",
  role: "HR Head",
  department: "HUMAN_RESOURCES",
};
const finance: ApprovalActor = {
  employeeId: "FIN-HEAD",
  name: "Finance reviewer",
  role: "Finance Head",
  department: "FINANCE",
};
const departmentHead: ApprovalActor = {
  employeeId: "OPS-HEAD",
  name: "Operations reviewer",
  role: "Department Head",
  department: "OPERATIONS",
};
const request = (department = "OPERATIONS"): ApprovalRequest => ({
  employeeId: "EMPLOYEE",
  employee: { department },
  status: "PENDING",
  notedBySupervisor: null,
  notedByHr: null,
  approvedBy: null,
});

test("HR staff: one HR action records both approvals with the same timestamp", () => {
  const ticket = request("HUMAN_RESOURCES");
  const update = getApprovalUpdate(ticket, hr, "note", actionTime);
  assert.deepEqual(update, {
    notedBySupervisor: hr.name,
    notedBySupervisorAt: actionTime,
    notedByHr: hr.name,
    notedByHrAt: actionTime,
    status: "NOTED",
  });
  const noted = { ...ticket, ...update };
  assert.deepEqual(getApprovalActions(noted, finance), ["approve", "deny"]);
  assert.equal(getApprovalUpdate(noted, finance, "approve", actionTime)?.status, "APPROVED");
});

test("Finance staff: HR review unlocks one combined department and Finance approval", () => {
  const ticket = request("FINANCE");
  assert.equal(getApprovalUpdate(ticket, finance, "approve", actionTime), null);
  const hrUpdate = getApprovalUpdate(ticket, hr, "note", actionTime);
  assert.equal(hrUpdate?.notedBySupervisor, undefined);
  const noted = { ...ticket, ...hrUpdate };
  assert.deepEqual(getApprovalUpdate(noted, finance, "approve", actionTime), {
    notedBySupervisor: finance.name,
    notedBySupervisorAt: actionTime,
    approvedBy: finance.name,
    approvedAt: actionTime,
    status: "APPROVED",
  });
});

for (const reviewers of [
  [departmentHead, hr],
  [hr, departmentHead],
]) {
  test(`Other departments require both notes, starting with ${reviewers[0]!.role}`, () => {
    let ticket = request();
    for (const [index, reviewer] of reviewers.entries()) {
      ticket = { ...ticket, ...getApprovalUpdate(ticket, reviewer, "note", actionTime) };
      assert.equal(ticket.status, index === 0 ? "PENDING" : "NOTED");
      assert.equal(getApprovalActions(ticket, finance).includes("approve"), index === 1);
    }
    assert.equal(getApprovalUpdate(ticket, finance, "approve", actionTime)?.status, "APPROVED");
  });
}

test("A previous partial HR note can be completed without replacing its audit fields", () => {
  const ticket = { ...request("HUMAN_RESOURCES"), notedByHr: "Previous HR reviewer" };
  const update = getApprovalUpdate(ticket, hr, "note", actionTime);
  assert.equal(update?.notedBySupervisor, hr.name);
  assert.equal(update?.notedByHr, undefined);
  assert.equal(update?.notedByHrAt, undefined);
  assert.equal(update?.status, "NOTED");
});

test("Completed approvals cannot be overwritten or replayed", () => {
  const ticket = request("HUMAN_RESOURCES");
  const noted = { ...ticket, ...getApprovalUpdate(ticket, hr, "note", actionTime) };
  assert.equal(getApprovalUpdate(noted, hr, "note", actionTime), null);
  const approved = { ...noted, ...getApprovalUpdate(noted, finance, "approve", actionTime) };
  assert.deepEqual(getApprovalActions(approved, finance), []);
  for (const status of ["ONGOING", "COMPLETED", "DENIED"]) {
    assert.deepEqual(getApprovalActions({ ...ticket, status }, hr), []);
  }
});

test("Department scope and central head departments are enforced", () => {
  assert.deepEqual(getApprovalActions(request("MIS"), departmentHead), []);
  assert.deepEqual(getApprovalActions(request(), { ...hr, department: "OPERATIONS" }), []);
  assert.deepEqual(getApprovalActions(request(), { ...finance, department: "OPERATIONS" }), []);
  assert.deepEqual(getApprovalActions(request(), { ...departmentHead, role: "Employee" }), []);
  assert.deepEqual(getApprovalActions(request(), { ...departmentHead, role: "Administrator" }), []);
});
