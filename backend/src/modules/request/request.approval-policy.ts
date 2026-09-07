export type ApprovalActor = {
  employeeId: string;
  name: string;
  role: string;
  department: string;
};

export type ApprovalRequest = {
  employeeId: string;
  employee: { department: string };
  status: string;
  notedBySupervisor: string | null;
  notedByHr: string | null;
  approvedBy: string | null;
};

export function canReviewRequest(request: ApprovalRequest, actor: ApprovalActor) {
  return (
    (actor.role === "Department Head" && actor.department === request.employee.department) ||
    (actor.role === "HR Head" && actor.department === "HUMAN_RESOURCES") ||
    (actor.role === "Finance Head" && actor.department === "FINANCE")
  );
}

export function getApprovalActions(request: ApprovalRequest, actor: ApprovalActor) {
  const actions: ("note" | "approve" | "deny")[] = [];
  if (!canReviewRequest(request, actor) || !["PENDING", "NOTED"].includes(request.status))
    return actions;

  if (
    request.status === "PENDING" &&
    ((actor.role === "Department Head" && !request.notedBySupervisor) ||
      (actor.role === "HR Head" &&
        (!request.notedByHr ||
          (request.employee.department === "HUMAN_RESOURCES" && !request.notedBySupervisor))))
  )
    actions.push("note");

  // Finance is also the department head for Finance employees. Requiring a
  // separate department note first would leave these requests stuck forever.
  if (
    actor.role === "Finance Head" &&
    request.notedByHr &&
    (request.notedBySupervisor || request.employee.department === "FINANCE") &&
    !request.approvedBy
  )
    actions.push("approve");

  actions.push("deny");
  return actions;
}

export function getApprovalUpdate(
  request: ApprovalRequest,
  actor: ApprovalActor,
  action: "note" | "approve",
  actionTime: Date,
) {
  if (!getApprovalActions(request, actor).includes(action)) return null;
  const update: {
    status?: "NOTED" | "APPROVED";
    notedBySupervisor?: string;
    notedBySupervisorAt?: Date;
    notedByHr?: string;
    notedByHrAt?: Date;
    approvedBy?: string;
    approvedAt?: Date;
  } = {};
  if (
    !request.notedBySupervisor &&
    (actor.role === "Department Head" || actor.department === request.employee.department)
  ) {
    update.notedBySupervisor = actor.name;
    update.notedBySupervisorAt = actionTime;
  }
  if (action === "note" && actor.role === "HR Head" && !request.notedByHr) {
    update.notedByHr = actor.name;
    update.notedByHrAt = actionTime;
  }
  if (action === "approve") {
    update.approvedBy = actor.name;
    update.approvedAt = actionTime;
    update.status = "APPROVED";
  } else if (
    (request.notedBySupervisor || update.notedBySupervisor) &&
    (request.notedByHr || update.notedByHr)
  ) {
    update.status = "NOTED";
  }
  return update;
}
