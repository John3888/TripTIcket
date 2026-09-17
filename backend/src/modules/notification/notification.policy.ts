import { type Department, type Prisma } from "@prisma/client";

export type NotificationActor = { userId: string; role: string; department: string };

type VisibleNotification = {
  recipients: Array<{ role: string }>;
  tripRequest: { employee: { department: string } } | null;
};

/**
 * The notification feed and notification mutations deliberately share this
 * policy. A row that is visible in the feed is therefore always actionable by
 * that same actor.
 */
export const notificationVisibilityWhere = (
  actor: NotificationActor,
): Prisma.NotificationWhereInput => ({
  recipients: { some: { role: actor.role } },
  ...(actor.role === "Department Head"
    ? {
        tripRequest: {
          is: { employee: { is: { department: actor.department as Department } } },
        },
      }
    : {}),
});

export const canViewNotification = (actor: NotificationActor, notification: VisibleNotification) =>
  notification.recipients.some((recipient) => recipient.role === actor.role) &&
  (actor.role !== "Department Head" ||
    notification.tripRequest?.employee.department === actor.department);
