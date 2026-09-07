import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import {
  Department,
  PrismaClient,
  type NotificationMode,
  type TripStatus,
  type VehicleStatus,
} from "@prisma/client";

const prisma = new PrismaClient();
const sourcePath = path.resolve("prisma/legacy-seed.local.json");
const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const parseDate = (value: unknown) => {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? new Date() : date;
};
const vehicleStatus = (value: string): VehicleStatus =>
  value === "On Trip" ? "ON_TRIP" : value === "Standby" ? "STANDBY" : "INACTIVE";
const tripStatus = (value: string): TripStatus => String(value).toUpperCase() as TripStatus;
const workflowRole = (role: string) =>
  ({
    Supervisor: "Department Head",
    "Human Resources": "HR Head",
    Finance: "Finance Head",
  })[role] || role;

for (const employee of source.employees) {
  await prisma.employee.upsert({
    where: { employeeId: employee.employeeId },
    update: {},
    create: {
      employeeId: employee.employeeId,
      firstName: employee.firstName,
      middleName: employee.middleName,
      surname: employee.surname,
      displayName: employee.name,
      designation: workflowRole(employee.designation || employee.role),
      role: workflowRole(employee.role),
      department: Department.OPERATIONS,
      email: employee.email.toLowerCase(),
      rfidUid: employee.rfid,
      status: employee.status === "Active" ? "ACTIVE" : "INACTIVE",
    },
  });
}
for (const user of source.users) {
  const employee = source.employees.find(
    (e: any) => e.employeeId === user.employeeId || e.rfid === user.rfid,
  );
  if (!employee) continue;
  await prisma.user.upsert({
    where: { userId: user.userId },
    update: {},
    create: {
      userId: user.userId,
      employeeId: employee.employeeId,
      passwordHash: await bcrypt.hash(user.password || employee.password, 12),
      appRole: workflowRole(user.appRole),
      notificationMode: String(user.notificationMode || "on").toUpperCase() as NotificationMode,
    },
  });
}
for (const vehicle of source.vehicles) {
  await prisma.vehicle.upsert({
    where: { vehicleId: vehicle.vehicleId },
    update: {},
    create: {
      vehicleId: vehicle.vehicleId,
      plate: vehicle.plate,
      status: vehicleStatus(vehicle.status),
      description: vehicle.description,
    },
  });
}
for (const step of source.workflow) {
  await prisma.workflowStep.upsert({
    where: { step: step.step },
    update: {},
    create: step,
  });
}
for (const request of source.requests) {
  const employee = source.employees.find((e: any) => e.name === request.employee),
    vehicle = source.vehicles.find((v: any) => v.plate === request.plate);
  if (!employee || !vehicle) continue;
  await prisma.tripRequest.upsert({
    where: { id: request.id },
    update: {},
    create: {
      id: request.id,
      status: tripStatus(request.status),
      employeeId: employee.employeeId,
      vehicleId: vehicle.vehicleId,
      destination: request.destination,
      purpose: request.purpose,
      estimatedSeconds: Number(request.estimatedSeconds) || 0,
      requestedAt: parseDate(request.requestedAt),
      notedBySupervisor: request.notedBySupervisor || null,
      notedBySupervisorAt: request.notedBySupervisorAt
        ? parseDate(request.notedBySupervisorAt)
        : null,
      notedByHr: request.notedByHr || null,
      notedByHrAt: request.notedByHrAt ? parseDate(request.notedByHrAt) : null,
      approvedBy: request.approvedBy || null,
      approvedAt: request.approvedAt ? parseDate(request.approvedAt) : null,
      decisionBy: request.decisionBy || null,
      decisionStatus: request.decisionStatus || null,
      departedAt: request.departure ? parseDate(`${request.date} ${request.departure}`) : null,
      arrivedAt: request.arrival ? parseDate(`${request.date} ${request.arrival}`) : null,
      elapsedSeconds: Number(request.elapsedSeconds) || 0,
      warned15: Boolean(request.warned15),
      flagged: Boolean(request.flagged),
      gpsPoints: {
        create: (request.gpsTrail || []).map((point: any) => ({
          deviceId: request.gps?.deviceId,
          latitude: point.latitude,
          longitude: point.longitude,
          speedKph: point.speedKph,
          heading: point.heading,
          accuracyMeters: point.accuracyMeters,
          recordedAt: parseDate(point.recordedAt),
        })),
      },
    },
  });
}
for (const item of source.notifications) {
  if (item.ticketId && !source.requests.some((r: any) => r.id === item.ticketId)) continue;
  await prisma.notification.upsert({
    where: { id: item.id },
    update: {},
    create: {
      id: item.id,
      tripRequestId: item.ticketId || null,
      recipients: {
        create: (item.recipients || []).map((role: string) => ({ role })),
      },
      title: item.title,
      body: item.body,
      kind: item.kind || "workflow",
      createdAt: parseDate(item.createdAt),
    },
  });
}
console.log("Legacy-compatible Trip Ticket seed imported.");
await prisma.$disconnect();
