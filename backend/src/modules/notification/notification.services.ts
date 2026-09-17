import { prisma } from "../../config/prismaClient.js";
import { AppError } from "../../middlewares/error.middleware.js";
import { notificationVisibilityWhere, type NotificationActor } from "./notification.policy.js";

const receiptStatus = (action: string) =>
  action === "close" ? "CLOSED" : action === "read" ? "READ" : null;

export async function update(id: string, action: string, actor: NotificationActor) {
  const status = receiptStatus(action);
  if (!status) throw new AppError(400, "Unsupported notification action.");
  const item = await prisma.notification.findFirst({
    where: {
      id,
      ...notificationVisibilityWhere(actor),
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
      ...notificationVisibilityWhere(actor),
    },
    select: { id: true },
  });
  await Promise.all(rows.map((row) => update(row.id, action, actor)));
}

export async function clear(actor: NotificationActor) {
  return updateAll("close", actor);
}
