import { api } from "./api";
import type { DeviceStatus, ScanResult } from "@/types/trip-ticket";
import { receiveTicketTiming } from "./travel-time";
export const rfidService = {
  status: () => api<DeviceStatus>("/rfid/status"),
  scan: (type: "ticket" | "movement", session: string, signal?: AbortSignal) =>
    api<ScanResult>("/rfid/scan", {
      method: "POST",
      body: JSON.stringify({ type, session }),
      signal,
    }).then((result) => ({
      ...result,
      movementTickets: result.movementTickets
        ? receiveTicketTiming(result.movementTickets)
        : undefined,
    })),
  cancel: (session: string) =>
    api("/rfid/cancel", { method: "POST", body: JSON.stringify({ session }) }),
};
