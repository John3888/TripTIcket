import type { Server } from "node:http";
import type { Duplex } from "node:stream";
import { timingSafeEqual } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import { gpsSchema } from "./gps.validation.js";

export const GPS_STREAM_PATH = "/api/gps/stream";
export const GPS_BATCH_INTERVAL_MS = 1000;
const batchSchema = z.object({
  type: z.literal("gps:positions"),
  requestId: z.string().min(1).max(80),
  reports: z.array(gpsSchema).min(1).max(16),
});
type Dependencies = {
  deviceKey: string;
  authorizeDevice: (deviceId: string) => Promise<boolean>;
  record: (report: z.infer<typeof gpsSchema>) => Promise<unknown>;
  presence?: (deviceId: string) => Promise<boolean>;
  diagnostics?: (deviceId: string, snapshot: Record<string, unknown>) => void;
};

function sameKey(actual: unknown, expected: string) {
  if (!expected || typeof actual !== "string") return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function attachGpsStream(server: Server, deps: Dependencies) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16384, perMessageDeflate: false });
  const clients = new Map<string, WebSocket>();
  const busy = new Set<string>();
  // These limits belong to device identities, so reconnecting cannot reset them.
  const limits = new Map<string, { positions: number; diagnostics: number }>();
  const reject = (socket: Duplex, status: number) => {
    if (socket.destroyed) return;
    socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  };
  server.on("upgrade", (request, socket, head) => {
    const path = request.url?.split("?")[0];
    if (path !== GPS_STREAM_PATH) {
      // Socket.IO owns the browser connection on its own path.
      if (!path?.startsWith("/socket.io/")) socket.destroy();
      return;
    }
    socket.on("error", () => {});
    const deviceId = request.headers["x-emb-device-id"];
    if (typeof deviceId !== "string" || !/^[\w-]{1,80}$/.test(deviceId) || !sameKey(request.headers["x-emb-gps-key"], deps.deviceKey)) {
      reject(socket, 403); return;
    }
    const handshakeTimer = setTimeout(() => socket.destroy(), 5000);
    handshakeTimer.unref();
    void (async () => {
      try {
        if (!await deps.authorizeDevice(deviceId)) { reject(socket, 403); return; }
        if (socket.destroyed) return;
        wss.handleUpgrade(request, socket, head, (ws) => {
          clients.get(deviceId)?.terminate();
          clients.set(deviceId, ws);
          let alive = true;
          let updatingPresence = false;
          const presence = async () => {
            if (!deps.presence || updatingPresence || clients.get(deviceId) !== ws) return;
            updatingPresence = true;
            try {
              if (!await deps.presence(deviceId) && ws.readyState === WebSocket.OPEN)
                ws.close(1008, "Device disabled or unregistered.");
            } catch {
              // A transient database error is retried on the next keepalive.
            } finally { updatingPresence = false; }
          };
          const send = (body: unknown) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(body));
          };
          ws.on("error", () => {});
          ws.on("pong", () => { alive = true; void presence(); });
          ws.on("close", () => { if (clients.get(deviceId) === ws) clients.delete(deviceId); });
          const heartbeat = setInterval(() => {
            if (!alive) { ws.terminate(); return; }
            alive = false;
            ws.ping();
          }, 30000);
          heartbeat.unref();
          ws.once("close", () => clearInterval(heartbeat));
          // Connectivity is independent of obtaining a GPS fix or starting a trip.
          void presence();
          ws.on("message", (raw, binary) => {
            let input: any;
            try { if (binary) throw new Error(); input = JSON.parse(raw.toString()); }
            catch { send({ type: "gps:ack", ok: false, status: 400, error: "Invalid JSON message." }); return; }
            const requestId = typeof input?.requestId === "string" ? input.requestId.slice(0, 80) : undefined;
            const fail = (status: number, error: string, retryAfterMs?: number) => send({ type: "gps:ack", requestId, ok: false, status, error, retryAfterMs });
            const limit = limits.get(deviceId) ?? { positions: 0, diagnostics: 0 };
            if (input?.type === "gps:diagnostics") {
              if (Date.now() - limit.diagnostics < 10000) return;
              limit.diagnostics = Date.now(); limits.set(deviceId, limit);
              if (input.snapshot?.deviceId !== deviceId || !deps.diagnostics) return;
              void deps.authorizeDevice(deviceId).then((allowed) => {
                if (!allowed || ws.readyState !== WebSocket.OPEN) return;
                deps.diagnostics!(deviceId, input.snapshot);
                send({ type: "gps:diagnostics:ack", ok: true });
              }).catch(() => {});
              return;
            }
            const parsed = batchSchema.safeParse(input);
            if (!parsed.success || parsed.data.reports.some((report) => report.deviceId !== deviceId)) {
              fail(400, "Invalid GPS batch or device identity."); return;
            }
            const elapsed = Date.now() - limit.positions;
            if (elapsed < GPS_BATCH_INTERVAL_MS) { fail(429, "Send at most one GPS batch per second.", GPS_BATCH_INTERVAL_MS - elapsed); return; }
            if (busy.has(deviceId)) { fail(409, "Previous GPS batch is still processing.", 1000); return; }
            limit.positions = Date.now(); limits.set(deviceId, limit); busy.add(deviceId);
            void (async () => {
              const results: unknown[] = [];
              try {
                for (const report of parsed.data.reports) {
                  try { results.push(await deps.record(report)); }
                  catch (error: any) {
                    results.push({ ok: false, recorded: false, status: error?.status ?? 500,
                      error: error?.status && error.status < 500 ? error.message : "GPS recording failed." });
                  }
                }
                send({ type: "gps:ack", requestId, ok: true, results });
              } finally { busy.delete(deviceId); }
            })();
          });
          send({ type: "gps:ready", intervalMs: GPS_BATCH_INTERVAL_MS, maxReports: 16 });
        });
      } catch { reject(socket, 503); }
      finally { clearTimeout(handshakeTimer); }
    })();
  });
  const cleanup = setInterval(() => {
    for (const [id, limit] of limits) {
      if (!clients.has(id) && !busy.has(id) && Date.now() - Math.max(limit.positions, limit.diagnostics) > 60000) limits.delete(id);
    }
  }, 60000);
  cleanup.unref();
  wss.once("close", () => clearInterval(cleanup));
  return wss;
}
