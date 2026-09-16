import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL = "mysql://test:test@127.0.0.1:1/rfid_status_test";
process.env.JWT_SECRET = "rfid-status-test-secret-not-for-production";
process.env.EMB_ESP32_HEARTBEAT_TIMEOUT_MS = "15000";
const device = await import("./rfid.device-client.js");

test("reader status expires without scans and recovers after heartbeats or valid reads", async (context) => {
  let now = 100000;
  context.mock.method(Date, "now", () => now);
  assert.equal((await device.status()).connected, false);
  device.receiveHeartbeat();
  assert.equal((await device.status()).connected, true);
  now += 14999;
  assert.equal((await device.status()).connected, true);
  now += 1;
  assert.equal((await device.status()).connected, false);
  device.receiveHeartbeat();
  assert.equal((await device.status()).connected, true);
  now += 15000;
  assert.equal((await device.status()).connected, false);
  assert.throws(() => device.receiveDeviceUid("invalid"));
  assert.equal((await device.status()).connected, false);
  device.receiveDeviceUid("AABBCCDD");
  assert.equal((await device.status()).connected, true);
  assert.equal((await device.status()).lastSeenAt, new Date(now).toISOString());
});
