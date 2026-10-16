import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:net";
import { PNG } from "pngjs";
import { tripReceiptHtml, credentialsReceiptHtml } from "./receipt-template.js";
import { pngToEscPos } from "./receipt-raster.js";
import { receiptBrowserPath } from "./receipt-renderer.js";

test("Puppeteer templates preserve guard fields and escape receipt text", () => {
  const receipt = {
    ticketId: "TT-1",
    employee: '<script>alert("x")</script>',
    vehicle: "ABC-123",
    destination: "Office & branch",
  };
  const guard = tripReceiptHtml(receipt, true);
  const requester = tripReceiptHtml(receipt, false);
  assert.match(guard, /Guards' Copy/);
  assert.match(guard, /Mileage Before:/);
  assert.match(guard, /ABC-123/);
  assert.match(guard, /&lt;script&gt;/);
  assert.match(guard, /Office &amp; branch/);
  assert.doesNotMatch(guard, /<script>/);
  assert.match(requester, /Requester's Copy/);
  assert.doesNotMatch(requester, /Mileage Before:|ABC-123/);
  assert.match(
    credentialsReceiptHtml({
      email: "juan@example.com",
      password: "<b>secret</b>",
    }),
    /&lt;b&gt;secret&lt;\/b&gt;/,
  );
});

test("raster conversion encodes black pixels, preserves white padding and cuts once", () => {
  const image = new PNG({ width: 8, height: 2 });
  image.data.fill(255);
  // A black pixel at x=0 in the first row, and x=7 in the second.
  for (const offset of [0, (8 + 7) * 4]) image.data.fill(0, offset, offset + 3);
  const bytes = pngToEscPos(PNG.sync.write(image), 8);
  assert.deepEqual(
    [...bytes.subarray(5, 13)],
    [0x1d, 0x76, 0x30, 0, 1, 0, 2, 0],
  );
  assert.deepEqual([...bytes.subarray(13, 15)], [128, 1]);
  assert.deepEqual([...bytes.subarray(-4)], [0x1d, 0x56, 65, 0]);
  assert.throws(() => pngToEscPos(PNG.sync.write(image), 576), /dimensions/);
});

test("long receipts use bounded raster strips without extra cuts", () => {
  const image = new PNG({ width: 8, height: 129 });
  image.data.fill(255);
  const bytes = pngToEscPos(PNG.sync.write(image), 8);
  assert.deepEqual(
    [...bytes.subarray(5, 13)],
    [0x1d, 0x76, 0x30, 0, 1, 0, 128, 0],
  );
  assert.deepEqual(
    [...bytes.subarray(141, 149)],
    [0x1d, 0x76, 0x30, 0, 1, 0, 1, 0],
  );
  assert.equal(bytes.length, 154);
});

function parseCopies(bytes: Buffer) {
  const copies: { ink: number; height: number }[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    assert.deepEqual(
      [...bytes.subarray(offset, offset + 5)],
      [0x1b, 0x40, 0x1b, 0x61, 0],
    );
    offset += 5;
    let ink = 0;
    let height = 0;
    while (bytes[offset] === 0x1d && bytes[offset + 1] === 0x76) {
      const rowBytes = bytes.readUInt16LE(offset + 4);
      const rows = bytes.readUInt16LE(offset + 6);
      assert.equal(rowBytes, 72);
      assert.ok(rows <= 128);
      height += rows;
      offset += 8;
      for (const byte of bytes.subarray(offset, offset + rowBytes * rows))
        if (byte) ink++;
      offset += rowBytes * rows;
    }
    assert.deepEqual(
      [...bytes.subarray(offset, offset + 4)],
      [0x1d, 0x56, 65, 0],
    );
    offset += 4;
    copies.push({ ink, height });
  }
  return copies;
}

let browserAvailable = true;
try {
  receiptBrowserPath();
} catch {
  browserAvailable = false;
}
test(
  "Puppeteer prints both copies directly and recovers after rendering failure",
  { skip: !browserAvailable, timeout: 60000 },
  async () => {
    process.env.DATABASE_URL ??= "mysql://unused:unused@localhost:3306/unused";
    process.env.PORT ??= "5001";
    process.env.JWT_SECRET ??=
      "test-only-session-secret-at-least-24-characters";
    const { ENV } = await import("../../config/env.js");
    const { printThermalReceipt, printAccountCredentials } =
      await import("./thermal-printer.js");
    const received: Buffer[] = [];
    const server = createServer((socket) => {
      const chunks: Buffer[] = [];
      socket.on("data", (chunk) => chunks.push(chunk));
      socket.on("end", () => received.push(Buffer.concat(chunks)));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const original = {
      host: ENV.EMB_RECEIPT_HOST,
      port: ENV.EMB_RECEIPT_PORT,
      browser: ENV.EMB_PRINT_BROWSER_PATH,
    };
    ENV.EMB_RECEIPT_HOST = "127.0.0.1";
    ENV.EMB_RECEIPT_PORT = address.port;
    const receipt = {
      ticketId: "TT-TEST",
      employee: "Juan Dela Cruz",
      vehicle: "ABC-123",
      destination: "Head office",
    };
    try {
      ENV.EMB_PRINT_BROWSER_PATH = "missing-browser-executable";
      await assert.rejects(
        printThermalReceipt(receipt),
        /Receipt printing failed/,
      );
      assert.equal(received.length, 0);
      ENV.EMB_PRINT_BROWSER_PATH = receiptBrowserPath();
      assert.deepEqual(await printThermalReceipt(receipt), { mode: "direct" });
      assert.equal(received.length, 1);
      const copies = parseCopies(received[0]!);
      assert.equal(copies.length, 2);
      assert.ok(copies.every((copy) => copy.ink > 100));
      assert.ok(
        copies[0]!.ink > copies[1]!.ink,
        "Guard copy includes vehicle and mileage fields",
      );
      assert.ok(
        copies[1]!.height < 600,
        "Short requester copy must not be padded to viewport height",
      );
      assert.ok(
        copies[0]!.height > copies[1]!.height,
        "Each copy uses its own content height",
      );
      assert.deepEqual(
        await printAccountCredentials({
          email: "test@example.com",
          password: "EMB-123456",
        }),
        { mode: "direct" },
      );
      assert.equal(received.length, 2);
      assert.equal(parseCopies(received[1]!).length, 1);
    } finally {
      ENV.EMB_RECEIPT_HOST = original.host;
      ENV.EMB_RECEIPT_PORT = original.port;
      ENV.EMB_PRINT_BROWSER_PATH = original.browser;
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
);
