import { api } from "./api";
import type { DeviceStatus, ScanResult } from "@/types/trip-ticket";
export const rfidService = {
  status: () => api<DeviceStatus>("/rfid/status"),
  scan: (type: "ticket" | "movement", session: string, signal?: AbortSignal) =>
    api<ScanResult>("/rfid/scan", {
      method: "POST",
      body: JSON.stringify({ type, session }),
      signal,
    }),
  cancel: (session: string) =>
    api("/rfid/cancel", { method: "POST", body: JSON.stringify({ session }) }),
};
