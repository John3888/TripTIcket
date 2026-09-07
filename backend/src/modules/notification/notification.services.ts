import { Prisma, type Department } from "@prisma/client";
import { prisma } from "../../config/prismaClient.js";
import { AppError } from "../../middlewares/error.middleware.js";

const receiptStatus = (action: string) =>
  action === "close" ? "CLOSED" : action === "read" ? "READ" : null;

type NotificationActor = { userId: string; role: string; department: string };

// System-wide notices do not belong to an employee department. They may only
// be acknowledged by central operations roles; trip-linked notices are always
// limited to the recipient's department.
const SYSTEM_NOTIFICATION_ROLES = ["HR Head", "Finance Head", "Administrator"];

const notificationDepartmentScope = (actor: NotificationActor): Prisma.NotificationWhereInput => ({
  OR: [
    {
      tripRequest: {
        is: {
          employee: {
            is: { department: actor.department as Department },
          },
        },
      },
    },
    ...(SYSTEM_NOTIFICATION_ROLES.includes(actor.role) ? [{ tripRequestId: null }] : []),
  ],
});

export async function update(id: string, action: string, actor: NotificationActor) {
  const status = receiptStatus(action);
  if (!status) throw new AppError(400, "Unsupported notification action.");
  const item = await prisma.notification.findFirst({
    where: {
      id,
      recipients: { some: { role: actor.role } },
      ...notificationDepartmentScope(actor),
    },
  });
  if (!item) throw new AppError(404, "Notification was not found.");
  return prisma.notificationReceipt.upsert({
    where: {
      notificationId_userId_status: { notificationId: id, userId: actor.userId, status },
    },
    create: { notificationId: id, userId: actor.userId, status },
    update: {},
  });
}

export async function updateAll(action: string, actor: NotificationActor) {
  const rows = await prisma.notification.findMany({
    where: {
      recipients: { some: { role: actor.role } },
      ...notificationDepartmentScope(actor),
    },
    select: { id: true },
  });
  await Promise.all(rows.map((row) => update(row.id, action, actor)));
}

export async function clear(actor: NotificationActor) {
  return updateAll("close", actor);
}
