import { Prisma, type Department } from "@prisma/client";
import { prisma } from "../../config/prismaClient.js";
import { AppError } from "../../middlewares/error.middleware.js";
import { tripTiming } from "../request/request.timing.js";
const escapeCsvValue = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
type ReportActor = { role: string; department: string } | undefined;
const departmentScope = (actor: ReportActor): Prisma.TripRequestWhereInput =>
  actor?.role === "Department Head"
    ? { employee: { is: { department: actor.department as Department } } }
    : {};

export async function requestCsv(actor: ReportActor) {
  const tripRequests = await prisma.tripRequest.findMany({
    where: departmentScope(actor),
    include: { employee: true, vehicle: true },
    orderBy: { requestedAt: "desc" },
  });
  const headers = [
    "TicketID",
    "Status",
    "EmployeeName",
    "VehiclePlate",
    "Destination",
    "EstimatedSeconds",
    "Purpose",
    "RequestedBy",
    "RequestedAt",
    "NotedBySupervisor",
    "NotedByHR",
    "ApprovedBy",
    "Departure",
    "Arrival",
    "ElapsedSeconds",
    "Flagged",
    "DecisionBy",
    "DecisionStatus",
    "OverdueSeconds",
    "ExpectedReturnAt",
  ];
  const reportTime = new Date();
  return [
    headers,
    ...tripRequests.map((tripRequest) => {
      const timing = tripTiming(tripRequest, reportTime);
      return [
      tripRequest.id,
      tripRequest.status.toLowerCase(),
      tripRequest.employee.displayName,
      tripRequest.vehicle.plate,
      tripRequest.destination,
      tripRequest.estimatedSeconds,
      tripRequest.purpose,
      tripRequest.employee.displayName,
      tripRequest.requestedAt.toISOString(),
      tripRequest.notedBySupervisor,
      tripRequest.notedByHr,
      tripRequest.approvedBy,
      tripRequest.departedAt?.toISOString(),
      tripRequest.arrivedAt?.toISOString(),
      timing.elapsedSeconds,
      timing.flagged ? "Yes" : "No",
      tripRequest.decisionBy,
      tripRequest.decisionStatus,
      timing.overdueSeconds,
      timing.expectedReturnAt,
    ];
    }),
  ]
    .map((row) => row.map(escapeCsvValue).join(","))
    .join("\r\n");
}
export async function receipt(tripRequestId: string, actor: ReportActor) {
  const tripRequest = await prisma.tripRequest.findUnique({
    where: { id: tripRequestId },
    include: { employee: true, vehicle: true },
  });
  if (!tripRequest) throw new AppError(404, "Trip ticket was not found.");
  if (actor?.role === "Department Head" && tripRequest.employee.department !== actor.department)
    throw new AppError(403, "This trip ticket belongs to another department.");
  return {
    ticketId: tripRequest.id,
    status: tripRequest.status.toLowerCase(),
    employee: tripRequest.employee.displayName,
    vehicle: tripRequest.vehicle.plate,
    destination: tripRequest.destination,
    purpose: tripRequest.purpose,
    requestedAt: tripRequest.requestedAt,
    ...tripTiming(tripRequest),
    supervisor: tripRequest.notedBySupervisor,
    humanResources: tripRequest.notedByHr,
    approvedBy: tripRequest.approvedBy,
  };
}
