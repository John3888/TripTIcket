import { prisma } from "../../config/prismaClient.js";
import type { StaffPage } from "../../config/access-policy.js";
import { getApprovalActions } from "../request/request.approval-policy.js";
import { tripTiming } from "../request/request.timing.js";
import { canViewNotification } from "../notification/notification.policy.js";

type StoreActor = {
  userId: string;
  employeeId: string;
  name: string;
  role: string;
  department: string;
};
type StoreOptions = { actor: StoreActor; page: StaffPage };
const status = (value: string) => value.toLowerCase();
const gpsPoint = (point: {
  id: bigint;
  deviceId: string | null;
  latitude: { toString(): string };
  longitude: { toString(): string };
  speedKph: { toString(): string } | null;
  heading: { toString(): string } | null;
  accuracyMeters: { toString(): string } | null;
  recordedAt: Date;
}) => ({
  id: point.id.toString(),
  deviceId: point.deviceId,
  latitude: Number(point.latitude),
  longitude: Number(point.longitude),
  speedKph: point.speedKph === null ? null : Number(point.speedKph),
  heading: point.heading === null ? null : Number(point.heading),
  accuracyMeters: point.accuracyMeters === null ? null : Number(point.accuracyMeters),
  recordedAt: point.recordedAt.toISOString(),
});
export async function publicStore({ actor, page }: StoreOptions) {
  const includeGps = page === "live-gps";
  const departmentScoped = actor.role === "Department Head";
  const [employees, vehicles, users, workflow, requests, notifications] = await Promise.all([
    prisma.employee.findMany({ orderBy: { employeeId: "asc" } }),
    prisma.vehicle.findMany({ orderBy: { vehicleId: "asc" } }),
    prisma.user.findMany({
      include: { employee: true },
      orderBy: { userId: "asc" },
    }),
    prisma.workflowStep.findMany({ orderBy: { step: "asc" } }),
    prisma.tripRequest.findMany({
      include: {
        employee: true,
        vehicle: true,
        gpsPoints: includeGps ? { where: { filterVersion: 1 }, orderBy: { recordedAt: "desc" }, take: 120 } : false,
      },
      orderBy: { requestedAt: "desc" },
    }),
    prisma.notification.findMany({
      include: { recipients: true, receipts: true, tripRequest: { include: { employee: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const visibleEmployees = departmentScoped
    ? employees.filter((employee) => employee.department === actor.department)
    : employees;
  const visibleUsers = departmentScoped
    ? users.filter((user) => user.employee.department === actor.department)
    : users;
  const visibleRequests = departmentScoped
    ? requests.filter((request) => request.employee.department === actor.department)
    : requests;
  const visibleNotifications = notifications.filter((notification) =>
    canViewNotification(actor, notification),
  );
  const requestRows = visibleRequests.map((r) => {
    // Prisma omits the relation for non-GPS pages, so it must be treated as
    // an empty trail rather than assuming it is always present.
    // Fetch the newest reports, then expose the trail in chronological order.
    const gpsTrail = (r.gpsPoints || []).map(gpsPoint).reverse();
    return {
      id: r.id,
      status: status(r.status),
      date: r.requestedAt.toISOString(),
      requestedAt: r.requestedAt.toISOString(),
      createdAt: r.requestedAt.toISOString(),
      employee: r.employee.displayName,
      plate: r.vehicle.plate,
      destination: r.destination,
      days: String(Math.floor(r.estimatedSeconds / 86400)),
      hours: String(Math.floor((r.estimatedSeconds % 86400) / 3600)),
      minutes: String(Math.floor((r.estimatedSeconds % 3600) / 60)),
      purpose: r.purpose,
      requestedBy: r.employee.displayName,
      requesterRole: r.employee.role,
      requesterDepartment: r.employee.department,
      approvalActions: getApprovalActions(r, actor),
      notedBySupervisor: r.notedBySupervisor || "",
      notedBySupervisorAt: r.notedBySupervisorAt?.toISOString() || "",
      notedByHr: r.notedByHr || "",
      notedByHrAt: r.notedByHrAt?.toISOString() || "",
      approvedBy: r.approvedBy || "",
      approvedAt: r.approvedAt?.toISOString() || "",
      decisionBy: r.decisionBy || "",
      decisionStatus: r.decisionStatus || "",
      ...tripTiming(r),
      gps: includeGps ? gpsTrail.at(-1) || null : null,
      gpsTrail: includeGps ? gpsTrail : [],
    };
  });
  return {
    employees: visibleEmployees.map((e) => ({
      employeeId: e.employeeId,
      firstName: e.firstName,
      middleName: e.middleName,
      surname: e.surname,
      name: e.displayName,
      designation: e.designation,
      role: e.role,
      department: e.department,
      email: e.email,
      status: e.status === "ACTIVE" ? "Active" : "Inactive",
    })),
    vehicles: vehicles.map((v) => ({
      vehicleId: v.vehicleId,
      plate: v.plate,
      status: v.status === "STANDBY" ? "Standby" : v.status === "ON_TRIP" ? "On Trip" : "Inactive",
      description: v.description,
    })),
    users: visibleUsers.map((u) => ({
      userId: u.userId,
      employeeId: u.employeeId,
      firstName: u.employee.firstName,
      middleName: u.employee.middleName,
      surname: u.employee.surname,
      name: u.employee.displayName,
      designation: u.employee.designation,
      appRole: u.appRole,
      role: u.appRole,
      department: u.employee.department,
      email: u.employee.email,
      notificationMode: u.notificationMode.toLowerCase(),
    })),
    workflow,
    requests: requestRows,
    notifications: visibleNotifications.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      kind: n.kind,
      ticketId: n.tripRequestId,
      recipients: n.recipients.map((recipient) => recipient.role),
      closedBy: n.receipts
        .filter((receipt) => receipt.status === "CLOSED")
        .map((receipt) => receipt.userId),
      readBy: n.receipts
        .filter((receipt) => receipt.status === "READ")
        .map((receipt) => receipt.userId),
      createdAt: n.createdAt.toISOString(),
    })),
    pending: requestRows.filter((r) => ["pending", "noted"].includes(r.status)),
    outgoing: requestRows.filter((r) => ["approved", "ongoing"].includes(r.status)),
    history: requestRows.filter((r) => ["completed", "denied"].includes(r.status)),
    updatedAt: new Date().toISOString(),
  };
}

// The self-service kiosk gets only operational display data, never employee,
// account, notification, purpose, or GPS records.
export async function kioskStore() {
  const [vehicles, requests] = await Promise.all([
    prisma.vehicle.findMany({ orderBy: { vehicleId: "asc" } }),
    prisma.tripRequest.findMany({
      include: { vehicle: true },
      orderBy: { requestedAt: "desc" },
    }),
  ]);
  const kioskRequests = requests.map((request) => ({
    id: request.id,
    status: status(request.status),
    requestedBy: "Employee",
    plate: request.vehicle.plate,
    destination: request.destination,
    purpose: "",
    createdAt: request.requestedAt.toISOString(),
    ...tripTiming(request),
    gps: null,
    gpsTrail: [],
  }));
  return {
    employees: [],
    users: [],
    notifications: [],
    vehicles: vehicles.map((vehicle) => ({
      vehicleId: vehicle.vehicleId,
      plate: vehicle.plate,
      status:
        vehicle.status === "STANDBY"
          ? "Standby"
          : vehicle.status === "ON_TRIP"
            ? "On Trip"
            : "Inactive",
      description: vehicle.description,
    })),
    requests: kioskRequests,
    pending: kioskRequests.filter((request) => ["pending", "noted"].includes(request.status)),
    outgoing: kioskRequests.filter((request) => ["approved", "ongoing"].includes(request.status)),
    history: kioskRequests.filter((request) => ["completed", "denied"].includes(request.status)),
    updatedAt: new Date().toISOString(),
  };
}
