import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { rfidService } from "../services/rfid.service";
import type { DeviceStatus } from "../types/trip-ticket";

function browserTimers(context: TestContext) {
  const events = new EventTarget();
  let poll = () => {};
  let expire = () => {};
  let cleared = false;
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setInterval: (callback: () => void, delay: number) => {
        assert.equal(delay, 2000);
        poll = callback;
        return 1;
      },
      clearInterval: () => {
        cleared = true;
      },
      setTimeout: (callback: () => void, delay: number) => {
        assert.equal(delay, 4000);
        expire = callback;
        return 2;
      },
      clearTimeout: () => {},
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
    },
  });
  context.after(() => {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  });
  return { poll: () => poll(), expire: () => expire(), events, cleared: () => cleared };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test("status updates without reopening, recovers from outages, and stops on close", async (context) => {
  const browser = browserTimers(context);
  const updates: DeviceStatus[] = [];
  let current = { connected: false, message: "Reader down" };
  let failed = false;
  const request = context.mock.method(rfidService, "status", async () => {
    if (failed) throw new Error("Network down");
    return current;
  });
  const stop = rfidService.watchStatus((status) => updates.push(status));
  await flush();
  assert.equal(updates.at(-1)?.connected, false);
  current = { connected: true, message: "Reader online" };
  browser.poll();
  await flush();
  assert.equal(updates.at(-1)?.connected, true);
  failed = true;
  browser.poll();
  await flush();
  assert.match(updates.at(-1)!.message, /status unavailable/);
  failed = false;
  browser.events.dispatchEvent(new Event("online"));
  await flush();
  assert.equal(updates.at(-1)?.connected, true);
  current = { connected: false, message: "Reader down" };
  browser.events.dispatchEvent(new Event("focus"));
  await flush();
  assert.equal(updates.at(-1)?.connected, false);
  stop();
  const calls = request.mock.callCount();
  browser.poll();
  browser.events.dispatchEvent(new Event("focus"));
  browser.events.dispatchEvent(new Event("online"));
  await flush();
  assert.equal(request.mock.callCount(), calls);
  assert.equal(browser.cleared(), true);
});

test("slow status checks do not overlap, time out, and abort silently on close", async (context) => {
  const browser = browserTimers(context);
  const updates: DeviceStatus[] = [];
  let lastSignal: AbortSignal | undefined;
  const request = context.mock.method(rfidService, "status", (signal?: AbortSignal) => {
    lastSignal = signal;
    return new Promise<DeviceStatus>((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
    });
  });
  const stop = rfidService.watchStatus((status) => updates.push(status));
  browser.poll();
  browser.events.dispatchEvent(new Event("focus"));
  assert.equal(request.mock.callCount(), 1);
  browser.expire();
  await flush();
  assert.equal(lastSignal?.aborted, true);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].connected, false);
  browser.poll();
  assert.equal(request.mock.callCount(), 2);
  stop();
  await flush();
  assert.equal(lastSignal?.aborted, true);
  assert.equal(updates.length, 1);
});
