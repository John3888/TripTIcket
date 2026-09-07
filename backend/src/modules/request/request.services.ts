import jwt from "jsonwebtoken";
import { prisma } from "../../config/prismaClient.js";
import { ENV } from "../../config/env.js";
import { AppError } from "../../middlewares/error.middleware.js";
import { getApprovalActions, getApprovalUpdate } from "./request.approval-policy.js";

type RequestActor = {
  employeeId: string;
  name: string;
  role: string;
  department: string;
};
type PendingNotification = {
  recipients: string[];
  id: string;
  title: string;
  body: string;
  kind: string;
  tripRequestId?: string | null;
};
function getRfidRequestActor(token: unknown): RequestActor {
  try {
    const proof = jwt.verify(String(token), ENV.JWT_SECRET) as Partial<RequestActor> & {
      purpose?: string;
    };
    if (
      proof.purpose !== "rfid-kiosk" ||
      !proof.employeeId ||
      !proof.name ||
      !proof.role ||
      !proof.department
    )
      throw new Error();
    return {
      employeeId: proof.employeeId,
      name: proof.name,
      role: proof.role,
      department: proof.department,
    };
  } catch {
    throw new AppError(401, "Please scan an employee ID card to continue.");
  }
}
const createNotification = async (
  databaseTransaction: any,
  pendingNotifications: PendingNotification[],
  recipients: string[],
  title: string,
  body: string,
  ticketId: string,
  kind: string,
) => {
  const notification = await databaseTransaction.notification.create({
    data: {
      id: `note-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      recipients: { create: recipients.map((role) => ({ role })) },
      title,
      body,
      tripRequestId: ticketId,
      kind,
    },
  });
  pendingNotifications.push({ ...notification, recipients });
};

export async function createTripRequest(requestInput: any) {
  const requestActor = getRfidRequestActor(requestInput.rfidToken);
  return prisma.$transaction(async (databaseTransaction) => {
    const requestedVehicle = await databaseTransaction.vehicle.findUnique({
      where: { plate: requestInput.plate },
    });
    if (!requestedVehicle || requestedVehicle.status !== "STANDBY")
      throw new AppError(409, "This vehicle is already requested or currently in use.");
    const requestingEmployee = await databaseTransaction.employee.findUnique({
      where: { employeeId: requestActor.employeeId },
    });
    if (!requestingEmployee || requestingEmployee.status !== "ACTIVE")
      throw new AppError(400, "The scanned employee is not active.");
    const latestTripRequest = await databaseTransaction.tripRequest.findFirst({
      orderBy: { id: "desc" },
      select: { id: true },
    });
    const tripRequestId = String(Number(latestTripRequest?.id || 0) + 1).padStart(6, "0");
    const tripRequest = await databaseTransaction.tripRequest.create({
      data: {
        id: tripRequestId,
        employeeId: requestingEmployee.employeeId,
        vehicleId: requestedVehicle.vehicleId,
        destination: requestInput.destination,
        purpose: requestInput.purpose,
        estimatedSeconds:
          (requestInput.days * 1440 + requestInput.hours * 60 + requestInput.minutes) * 60,
      },
    });
    const pendingNotifications: PendingNotification[] = [];
    await createNotification(
      databaseTransaction,
      pendingNotifications,
      ["Department Head", "HR Head"],
      "New trip ticket",
      `${tripRequestId} is waiting for notation.`,
      tripRequestId,
      "submitted",
    );
    return { request: tripRequest, notifications: pendingNotifications };
  });
}

export async function processTripRequestAction(
  tripRequestId: string,
  actionInput: any,
  authenticatedActor?: RequestActor,
) {
  const isMovement = ["start", "complete"].includes(actionInput.action);
  const requestActor =
    isMovement && actionInput.rfidToken
      ? getRfidRequestActor(actionInput.rfidToken)
      : authenticatedActor || getRfidRequestActor(actionInput.rfidToken);
  return prisma.$transaction(async (databaseTransaction) => {
    const tripRequest = await databaseTransaction.tripRequest.findUnique({
      where: { id: tripRequestId },
      include: { employee: { select: { department: true } } },
    });
    if (!tripRequest) throw new AppError(404, "Not found");
    const approvalActions = getApprovalActions(tripRequest, requestActor);
    const actionTime = new Date();
    let tripRequestUpdate: any = {};
    const pendingNotifications: PendingNotification[] = [];
    if (actionInput.action === "note" && approvalActions.includes("note")) {
      tripRequestUpdate = getApprovalUpdate(tripRequest, requestActor, "note", actionTime);
      if (
        tripRequestUpdate.status === "NOTED" ||
        (tripRequest.employee.department === "FINANCE" && tripRequestUpdate.notedByHr)
      ) {
        await createNotification(
          databaseTransaction,
          pendingNotifications,
          ["Finance Head"],
          "Pending final approval",
          `${tripRequestId} is now in the Finance approval dashboard.`,
          tripRequestId,
          "noted",
        );
      }
    } else if (actionInput.action === "approve" && approvalActions.includes("approve")) {
      tripRequestUpdate = getApprovalUpdate(tripRequest, requestActor, "approve", actionTime);
      await createNotification(
        databaseTransaction,
        pendingNotifications,
        ["Requester"],
        "Request approved",
        `${tripRequestId} moved to Outgoing Requests.`,
        tripRequestId,
        "approved",
      );
    } else if (actionInput.action === "deny" && approvalActions.includes("deny")) {
      tripRequestUpdate = {
        status: "DENIED",
        decisionBy: requestActor.name,
        decisionStatus: `Denied by ${requestActor.role}`,
      };
      await createNotification(
        databaseTransaction,
        pendingNotifications,
        ["Requester"],
        "Request denied",
        `${tripRequestId} was denied by ${requestActor.role}.`,
        tripRequestId,
        "denied",
      );
    } else if (
      ["start", "complete"].includes(actionInput.action) &&
      requestActor.employeeId === tripRequest.employeeId &&
      ((actionInput.action === "start" && tripRequest.status === "APPROVED") ||
        (actionInput.action === "complete" && tripRequest.status === "ONGOING"))
    ) {
      if (actionInput.action === "start") {
        tripRequestUpdate = {
          status: "ONGOING",
          departedAt: actionTime,
          elapsedSeconds: 0,
          warned15: false,
        };
        await databaseTransaction.vehicle.update({
          where: { vehicleId: tripRequest.vehicleId },
          data: { status: "ON_TRIP" },
        });
        await createNotification(
          databaseTransaction,
          pendingNotifications,
          ["Requester"],
          "Trip started",
          `${tripRequestId} is now ongoing.`,
          tripRequestId,
          "started",
        );
      } else {
        const elapsedTripSeconds = tripRequest.departedAt
          ? Math.max(
              0,
              Math.round((actionTime.getTime() - tripRequest.departedAt.getTime()) / 1000),
            )
          : tripRequest.elapsedSeconds;
        tripRequestUpdate = {
          status: "COMPLETED",
          arrivedAt: actionTime,
          elapsedSeconds: elapsedTripSeconds,
          flagged:
            tripRequest.flagged ||
            (tripRequest.estimatedSeconds > 0 && elapsedTripSeconds > tripRequest.estimatedSeconds),
        };
        await databaseTransaction.vehicle.update({
          where: { vehicleId: tripRequest.vehicleId },
          data: { status: "STANDBY" },
        });
        await createNotification(
          databaseTransaction,
          pendingNotifications,
          ["Requester", "Department Head", "HR Head"],
          "Trip completed",
          `${tripRequestId} was completed and moved to History.`,
          tripRequestId,
          "completed",
        );
      }
    } else throw new AppError(403, "You are not allowed to perform this action for this ticket.");
    const updatedTripRequest = await databaseTransaction.tripRequest.update({
      where: { id: tripRequestId },
      data: tripRequestUpdate,
    });
    return { request: updatedTripRequest, notifications: pendingNotifications };
  });
}
export async function deleteTripRequest(tripRequestId: string) {
  return prisma.$transaction(async (databaseTransaction) => {
    const tripRequest = await databaseTransaction.tripRequest.findUnique({
      where: { id: tripRequestId },
    });
    if (!tripRequest) throw new AppError(404, "Not found");
    if (tripRequest.status !== "PENDING" || tripRequest.notedBySupervisor || tripRequest.notedByHr)
      throw new AppError(409, "Only un-noted pending tickets can be deleted.");
    await databaseTransaction.notification.deleteMany({ where: { tripRequestId } });
    return databaseTransaction.tripRequest.delete({ where: { id: tripRequestId } });
  });
}
