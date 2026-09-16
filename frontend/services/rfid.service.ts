import { api } from "./api";
import type { DeviceStatus, ScanResult } from "@/types/trip-ticket";
import { receiveTicketTiming } from "./travel-time";
export const rfidService = {
  status: (signal?: AbortSignal) =>
    api<DeviceStatus>("/rfid/status", { signal, cache: "no-store" }),
  watchStatus: (onStatus: (status: DeviceStatus) => void) => {
    let stopped = false;
    let activeRequest: AbortController | null = null;
    const refresh = async () => {
      if (stopped || activeRequest) return;
      const controller = new AbortController();
      activeRequest = controller;
      const timeout = window.setTimeout(() => controller.abort(), 4000);
      try {
        const status = await rfidService.status(controller.signal);
        if (!stopped) onStatus(status);
      } catch {
        if (!stopped)
          onStatus({
            connected: false,
            message: "Cannot reach the server. Reader status unavailable; reconnecting…",
          });
      } finally {
        window.clearTimeout(timeout);
        activeRequest = null;
      }
    };
    // Public kiosks have no login cookie for the authenticated Socket.IO feed.
    // Short polling also recovers automatically after network/server outages.
    void refresh();
    const interval = window.setInterval(() => void refresh(), 2000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      activeRequest?.abort();
    };
  },
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
