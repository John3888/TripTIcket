import type { RequestHandler } from "express";

// Per-process intake limit. Recording still uses database locks per device/trip.
export function devicePostHandler(options: {
  deviceKey: string; record: (body: any) => Promise<unknown>; intervalMs: number; now?: () => number;
}): RequestHandler {
  const slots = new Map<string, { nextAt: number; busy: boolean }>();
  const clock = options.now ?? Date.now;
  let lastCleanup = 0;
  return async (req, res, next) => {
    const key = String(req.headers["x-emb-gps-key"] || req.body?.deviceKey || "");
    if (!options.deviceKey || key !== options.deviceKey) {
      res.status(403).json({ ok: false, error: "GPS device is not authorized." }); return;
    }
    const id = req.body?.deviceId;
    if (typeof id !== "string" || !/^[\w-]{1,80}$/.test(id)) {
      res.status(400).json({ ok: false, error: "A valid device ID is required." }); return;
    }
    const now = clock();
    if (now - lastCleanup >= 60000) {
      for (const [deviceId, slot] of slots) if (!slot.busy && slot.nextAt < now - 60000) slots.delete(deviceId);
      lastCleanup = now;
    }
    const slot = slots.get(id);
    if (slot && (slot.busy || now < slot.nextAt)) {
      const retryAfterMs = Math.max(1000, slot.nextAt - now);
      res.setHeader("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
      res.status(429).json({ ok: false, error: "GPS uploads are arriving too quickly. Retry later.", retryAfterMs }); return;
    }
    if (!slot && slots.size >= 10000) {
      res.status(503).json({ ok: false, error: "GPS intake is busy. Retry later." }); return;
    }
    const lease = { nextAt: now + options.intervalMs, busy: true };
    slots.set(id, lease);
    try { res.json(await options.record(req.body)); }
    catch (error: any) {
      if (error?.status === 400 || error?.status === 403) slots.delete(id);
      else lease.nextAt = clock() + options.intervalMs;
      next(error);
    }
    finally { lease.busy = false; }
  };
}
