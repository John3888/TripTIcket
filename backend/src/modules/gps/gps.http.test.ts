import assert from "node:assert/strict";
import { test } from "node:test";
import { devicePostHandler } from "./gps.http.js";

async function invoke(handler: ReturnType<typeof devicePostHandler>, key = "key", deviceId = "GPS-1") {
  const result = { status: 200, body: undefined as any, headers: {} as Record<string, string>, error: undefined as any };
  const req = { headers: { "x-emb-gps-key": key }, body: { deviceId, hasFix: false } };
  const res = { status(code: number) { result.status = code; return this; },
    json(body: unknown) { result.body = body; return this; },
    setHeader(name: string, value: string) { result.headers[name] = value; } };
  await handler(req as any, res as any, (error: unknown) => { result.error = error; });
  return result;
}

test("HTTPS intake authenticates reports and accepts no-fix heartbeats", async () => {
  let calls = 0;
  const handler = devicePostHandler({ deviceKey: "key", intervalMs: 1000, record: async () => { calls++; return { ok: true, recorded: false, reason: "no_fix" }; } });
  assert.equal((await invoke(handler, "wrong")).status, 403);
  assert.equal(calls, 0);
  assert.equal((await invoke(handler)).body.reason, "no_fix");
  assert.equal(calls, 1);
  const unset = devicePostHandler({ deviceKey: "", intervalMs: 1000, record: async () => assert.fail("Unauthorized intake") });
  assert.equal((await invoke(unset, "")).status, 403);
});

test("HTTPS GPS reports are limited per device to one request per second", async () => {
  let now = 10000, calls = 0;
  const handler = devicePostHandler({ deviceKey: "key", intervalMs: 1000, now: () => now,
    record: async () => { calls++; return { ok: true, recorded: true }; } });
  assert.equal((await invoke(handler)).status, 200);
  const fast = await invoke(handler); assert.equal(fast.status, 429); assert.equal(fast.headers["Retry-After"], "1");
  assert.equal((await invoke(handler, "key", "GPS-2")).status, 200);
  now += 1000;
  assert.equal((await invoke(handler)).status, 200); assert.equal(calls, 3);
});

test("slow writes cannot overlap and diagnostic uploads use an independent ten-second limit", async () => {
  let now = 10000, finish!: () => void;
  const waiting = new Promise<void>((resolve) => { finish = resolve; });
  const handler = devicePostHandler({ deviceKey: "key", intervalMs: 1000, now: () => now, record: async () => { await waiting; return { ok: true }; } });
  const first = invoke(handler); now += 2000;
  assert.equal((await invoke(handler)).status, 429); finish(); assert.equal((await first).status, 200);
  const diagnostic = devicePostHandler({ deviceKey: "key", intervalMs: 10000, now: () => now, record: async () => ({ ok: true }) });
  assert.equal((await invoke(diagnostic)).status, 200); now += 1000;
  assert.equal((await invoke(diagnostic)).status, 429); now += 9000;
  assert.equal((await invoke(diagnostic)).status, 200);
});
