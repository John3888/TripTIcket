import jwt from "jsonwebtoken";
import { prisma } from "../../config/prismaClient.js";
import { ENV } from "../../config/env.js";
import { AppError } from "../../middlewares/error.middleware.js";
import * as device from "./rfid.device-client.js";
import { normalizeUid } from "./rfid.types.js";
import { tripTiming } from "../request/request.timing.js";

const recent = new Map<string, number>();
export async function scan(body: { type: string; timeoutMs?: number; session?: string }) {
  const payload = await device.scan(body),
    values = [payload.uid, payload.rawUid].filter(Boolean).map(normalizeUid),
    uid = values[0];
  if (!uid || !/^[A-F0-9]{4,32}$/.test(uid) || new Set(values).size > 1)
    throw new AppError(400, "The ESP32 returned an invalid card UID.");
  const key = `${body.session || "anonymous"}:${uid}`,
    now = Date.now();
  if (now - (recent.get(key) || 0) < 1500) throw new AppError(409, "Duplicate ID scan ignored.");
  recent.set(key, now);
  await device.cancel({ session: body.session }).catch(() => undefined);
  const employee = await prisma.employee.findUnique({
    where: { rfidUid: uid },
    include: { user: true },
  });
  if (!employee)
    throw new AppError(
      403,
      "This card is not registered. Please contact an administrator to register it.",
    );
  if (employee.status !== "ACTIVE") throw new AppError(403, "This employee card is inactive.");
  // Movement tickets belong to the verified card holder. The public kiosk
  // store deliberately hides employee identities and cannot identify owners.
  const movementTickets =
    body.type === "movement"
      ? await prisma.tripRequest.findMany({
          where: { employeeId: employee.employeeId, status: { in: ["APPROVED", "ONGOING"] } },
          select: {
            id: true,
            status: true,
            destination: true,
            requestedAt: true,
            departedAt: true,
            arrivedAt: true,
            elapsedSeconds: true,
            estimatedSeconds: true,
            flagged: true,
            vehicle: { select: { plate: true } },
          },
          orderBy: { requestedAt: "desc" },
        })
      : undefined;
  const rfidToken = jwt.sign(
    {
      purpose: "rfid-kiosk",
      employeeId: employee.employeeId,
      rfidUid: uid,
      name: employee.displayName,
      role: employee.role,
      department: employee.department,
    },
    ENV.JWT_SECRET,
    { expiresIn: "5m" },
  );
  return {
    ok: true,
    type: body.type,
    uid,
    rawUid: String(payload.rawUid || payload.uid),
    rfidToken,
    ...(movementTickets && {
      movementTickets: movementTickets.map((ticket) => ({
        id: ticket.id,
        status: ticket.status.toLowerCase(),
        destination: ticket.destination,
        plate: ticket.vehicle.plate,
        requestedBy: employee.displayName,
        purpose: "",
        createdAt: ticket.requestedAt.toISOString(),
        ...tripTiming(ticket),
      })),
    }),
    employee: {
      employeeId: employee.employeeId,
      name: employee.displayName,
      role: employee.role,
      department: employee.department,
      email: employee.email,
      status: employee.status,
    },
    user: employee.user
      ? {
          userId: employee.user.userId,
          employeeId: employee.employeeId,
          name: employee.displayName,
          role: employee.user.appRole,
          department: employee.department,
          email: employee.email,
          notificationMode: employee.user.notificationMode.toLowerCase(),
        }
      : null,
  };
}
export const cancel = (body: unknown) => device.cancel(body as { session?: string });
export const status = () => device.status();
export const receive = (uid: unknown) => device.receiveDeviceUid(uid);
export const heartbeat = () => device.receiveHeartbeat();
