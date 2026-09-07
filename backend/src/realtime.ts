import type { Server } from "socket.io";

let io: Server | undefined;

export function setRealtime(server: Server) {
  io = server;
}

export function emitStoreUpdated(roles?: string[]) {
  const event = { updatedAt: new Date().toISOString() };
  if (!roles?.length) io?.to("trip-ticket").emit("store:updated", event);
  else roles.forEach((role) => io?.to(`role:${role}`).emit("store:updated", event));
}

export function emitGpsPosition(position: {
  ticketId: string;
  gps: {
    id: string;
    deviceId: string | null;
    latitude: number;
    longitude: number;
    speedKph: number | null;
    heading: number | null;
    accuracyMeters: number | null;
    recordedAt: string;
  };
}) {
  io?.to("live-gps").emit("gps:position", position);
}

export function emitNotification(notification: {
  recipients: unknown;
  id: string;
  title: string;
  body: string;
  kind: string;
  tripRequestId?: string | null;
}) {
  const recipients = Array.isArray(notification.recipients)
    ? notification.recipients.filter((role): role is string => typeof role === "string")
    : [];
  const payload = {
    id: notification.id,
    title: notification.title,
    message: notification.body,
    kind: notification.kind,
    ticketId: notification.tripRequestId ?? null,
  };
  recipients.forEach((role) => io?.to(`role:${role}`).emit("notification:new", payload));
}
