import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { test, type TestContext } from "node:test";
import { WebSocket } from "ws";
import { Server } from "socket.io";
import { attachGpsStream } from "./gps.stream.js";
import { emitGpsPosition, setRealtime } from "../../realtime.js";

const key = "test-device-key";
const headers = { "x-emb-gps-key": key, "x-emb-device-id": "GPS-1" };
const sample = (deviceId = "GPS-1") => ({ deviceId, latitude: 10, longitude: 122, hasFix: true });
const batch = (id: string, reports = [sample()]) => ({ type: "gps:positions", requestId: id, reports });

async function client(url: string, auth = headers) {
  const ws = new WebSocket(url, { headers: auth });
  const messages: string[] = [];
  const listeners: ((message: string) => void)[] = [];
  ws.on("message", (raw) => {
    const message = raw.toString();
    const listener = listeners.shift();
    if (listener) listener(message); else messages.push(message);
  });
  await once(ws, "open");
  return { ws, async nextRaw() {
    if (messages.length) return messages.shift()!;
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WebSocket reply timed out")), 3000);
      listeners.push((message) => { clearTimeout(timer); resolve(message); });
    });
  }, async next(): Promise<any> { return JSON.parse(await this.nextRaw()); },
  send(body: unknown) { ws.send(JSON.stringify(body)); } };
}

async function harness(t: TestContext, record?: (body: any) => Promise<unknown>, deviceKey = key, presence?: (id: string) => Promise<boolean>) {
  const http = createServer((_req, res) => { res.writeHead(404).end(); });
  const io = new Server(http, { destroyUpgrade: false });
  setRealtime(io);
  io.on("connection", (socket) => { socket.join("live-gps"); });
  const saved: any[] = [];
  const diagnostics: unknown[] = [];
  const presences: string[] = [];
  const stream = attachGpsStream(http, {
    deviceKey,
    authorizeDevice: async (id) => id === "GPS-1",
    record: record ?? (async (body) => {
      saved.push(body);
      const point = { id: String(saved.length), deviceId: body.deviceId, latitude: body.latitude!, longitude: body.longitude!,
        speedKph: null, heading: null, accuracyMeters: null, recordedAt: new Date().toISOString() };
      emitGpsPosition({ ticketId: "TRIP-1", gps: point });
      return { ok: true, recorded: true };
    }),
    diagnostics: (_id, snapshot) => { diagnostics.push(snapshot); },
    presence: async (id) => { presences.push(id); return presence ? presence(id) : true; },
  });
  http.listen(0, "127.0.0.1"); await once(http, "listening");
  const address = http.address(); assert.ok(address && typeof address === "object");
  t.after(async () => {
    for (const ws of stream.clients) ws.terminate();
    await new Promise<void>((resolve) => stream.close(() => resolve()));
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });
  return { url: `ws://127.0.0.1:${address.port}`, saved, diagnostics, presences, stream };
}

test("connection and keepalive update presence without any GPS reports; disabled devices close", { timeout: 10000 }, async (t) => {
  let enabled = true;
  let update!: () => void;
  const { url, presences, saved, stream } = await harness(t, undefined, key, async () => { update?.(); return enabled; });
  const device = await client(`${url}/api/gps/stream`); await device.next();
  assert.deepEqual(presences, ["GPS-1"]);
  const refreshed = new Promise<void>((resolve) => { update = resolve; });
  [...stream.clients][0]!.ping();
  await refreshed;
  assert.equal(presences.length, 2); assert.equal(saved.length, 0);
  enabled = false;
  const closed = once(device.ws, "close");
  [...stream.clients][0]!.ping();
  assert.equal((await closed)[0], 1008);
});

test("device WebSocket rejects wrong/missing keys, unregistered devices and an unset server key", { timeout: 10000 }, async (t) => {
  const { url } = await harness(t);
  await assert.rejects(client(`${url}/api/gps/stream`, { ...headers, "x-emb-gps-key": "wrong" }), /403/);
  await assert.rejects(client(`${url}/api/gps/stream`, { ...headers, "x-emb-device-id": "unknown" }), /403/);
  await assert.rejects(client(`${url}/api/gps/stream`, {} as typeof headers), /403/);
  const unset = await harness(t, undefined, "");
  await assert.rejects(client(`${unset.url}/api/gps/stream`), /403/);
});

test("a device batch reaches backend recording and the existing frontend WebSocket broadcast", { timeout: 10000 }, async (t) => {
  const { url, saved } = await harness(t);
  // Exercise the actual Engine.IO/Socket.IO WebSocket wire alongside the raw device stream.
  const frontend = await client(`${url}/socket.io/?EIO=4&transport=websocket`);
  assert.ok((await frontend.nextRaw()).startsWith("0"));
  frontend.ws.send("40");
  assert.ok((await frontend.nextRaw()).startsWith("40"));
  const device = await client(`${url}/api/gps/stream`);
  assert.equal((await device.next()).type, "gps:ready");
  device.send(batch("batch-1", [sample(), { ...sample(), latitude: 10.000001 }]));
  const reply = await device.next();
  assert.equal(reply.ok, true); assert.equal(reply.results.length, 2); assert.equal(saved.length, 2);
  for (let i = 0; i < 2; i++) {
    const wire = await frontend.nextRaw();
    assert.ok(wire.startsWith("42"));
    const [event, payload] = JSON.parse(wire.slice(2));
    assert.equal(event, "gps:position"); assert.equal(payload.ticketId, "TRIP-1");
    assert.equal(payload.gps.id, String(i + 1));
  }
  frontend.ws.close(); device.ws.close();
});

test("invalid batches and device spoofing are rejected before recording; diagnostics share the stream", { timeout: 10000 }, async (t) => {
  const { url, saved, diagnostics } = await harness(t);
  const device = await client(`${url}/api/gps/stream`); await device.next();
  device.send(batch("spoof", [sample("GPS-2")])); assert.equal((await device.next()).status, 400);
  device.send(batch("partial", [sample(), { ...sample(), latitude: 91 }])); assert.equal((await device.next()).status, 400);
  device.send(batch("large", Array.from({ length: 17 }, () => sample()))); assert.equal((await device.next()).status, 400);
  assert.equal(saved.length, 0);
  device.send({ type: "gps:diagnostics", snapshot: { deviceId: "GPS-1", gps: { hasFix: true } } });
  assert.equal((await device.next()).type, "gps:diagnostics:ack"); assert.equal(diagnostics.length, 1);
  device.ws.close();
});

test("one-batch-per-second limit survives reconnects and permits a batch after the interval", { timeout: 10000 }, async (t) => {
  const { url, saved } = await harness(t);
  const first = await client(`${url}/api/gps/stream`); await first.next();
  first.send(batch("first")); await first.next();
  first.send(batch("fast"));
  const limited = await first.next(); assert.equal(limited.status, 429); assert.ok(limited.retryAfterMs > 0);
  const second = await client(`${url}/api/gps/stream`); await second.next();
  second.send(batch("reconnect")); assert.equal((await second.next()).status, 429);
  await delay(1050);
  second.send(batch("later")); assert.equal((await second.next()).ok, true);
  assert.equal(saved.length, 2); second.ws.close();
});

test("backpressure prevents parallel writes and returns per-reading failures without replay", { timeout: 10000 }, async (t) => {
  let finish!: () => void;
  const waiting = new Promise<void>((resolve) => { finish = resolve; });
  let calls = 0;
  const { url } = await harness(t, async () => {
    calls++; await waiting;
    if (calls === 2) throw Object.assign(new Error("Device disabled"), { status: 403 });
    return { ok: true, recorded: true };
  });
  const device = await client(`${url}/api/gps/stream`); await device.next();
  device.send(batch("waiting", [sample(), sample()]));
  await delay(1050);
  device.send(batch("busy")); assert.equal((await device.next()).status, 409); assert.equal(calls, 1);
  finish();
  const reply = await device.next(); assert.equal(reply.requestId, "waiting");
  assert.equal(reply.results[0].recorded, true); assert.equal(reply.results[1].status, 403);
  device.ws.close();
});
