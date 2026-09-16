import { AppError } from "../../middlewares/error.middleware.js";
import { ENV } from "../../config/env.js";
import { normalizeUid } from "./rfid.types.js";

type DevicePayload = {
  ok: true;
  uid: string;
  rawUid: string;
  receivedAt: string;
};
type Waiter = {
  session: string;
  resolve: (payload: DevicePayload) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};
const waiters: Waiter[] = [];
let lastSeenAt = 0;
let lastUid = "";
let lastUidAt = 0;

export function receiveHeartbeat() {
  lastSeenAt = Date.now();
  return {
    ok: true,
    serverTime: new Date(lastSeenAt).toISOString(),
    pendingScans: waiters.length,
  };
}

export function receiveDeviceUid(value: unknown) {
  const rawUid = String(value ?? "").trim();
  const uid = normalizeUid(rawUid);
  if (!uid || !/^[A-F0-9]{4,32}$/.test(uid))
    throw new AppError(400, "A valid RFID UID is required.");
  const now = Date.now();
  lastSeenAt = now;
  if (uid === lastUid && now - lastUidAt < 1500)
    return { ok: true, duplicate: true, delivered: false, uid };
  lastUid = uid;
  lastUidAt = now;
  const waiter = waiters.shift();
  if (!waiter) return { ok: true, delivered: false, uid };
  clearTimeout(waiter.timer);
  waiter.resolve({
    ok: true,
    uid,
    rawUid,
    receivedAt: new Date(now).toISOString(),
  });
  return { ok: true, delivered: true, uid };
}

export function scan(body: { session?: string; timeoutMs?: number }) {
  const session = String(body.session || `scan-${Date.now()}`);
  const timeoutMs = Math.max(5000, Math.min(Number(body.timeoutMs) || 60000, 65000));
  void cancel({ session });
  return new Promise<DevicePayload>((resolve, reject) => {
    const waiter: Waiter = {
      session,
      resolve,
      reject,
      timer: setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        reject(new AppError(408, "ID scan timed out."));
      }, timeoutMs),
    };
    waiters.push(waiter);
  });
}

export async function cancel(body: { session?: string } = {}) {
  const session = String(body.session || "");
  for (let index = waiters.length - 1; index >= 0; index -= 1) {
    if (!session || waiters[index]?.session === session) {
      const [waiter] = waiters.splice(index, 1);
      if (waiter) {
        clearTimeout(waiter.timer);
        waiter.reject(new AppError(499, "ID scan cancelled."));
      }
    }
  }
  return { ok: true, cancelled: true };
}

export async function status() {
  const deviceRecentlySeen =
    lastSeenAt > 0 && Date.now() - lastSeenAt < ENV.EMB_ESP32_HEARTBEAT_TIMEOUT_MS;
  return {
    ok: true,
    connected: deviceRecentlySeen,
    receiverReady: true,
    deviceRecentlySeen,
    message: deviceRecentlySeen ? "ESP32 RFID reader online" : "ESP32 RFID reader is down",
    device: "ESP32 RFID",
    capabilities: { read: true, write: false },
    lastSeenAt: lastSeenAt ? new Date(lastSeenAt).toISOString() : null,
    pendingScans: waiters.length,
  };
}
