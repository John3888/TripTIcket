import assert from "node:assert/strict";
import { test } from "node:test";
import {
  thermalReceiptBytes,
  wrapReceiptText,
  accountCredentialsBytes,
} from "./thermal-receipt.js";

test("departure receipts contain two cut copies with guard-only mileage fields", () => {
  const bytes = thermalReceiptBytes(
    {
      ticketId: "TT-1",
      employee: "Juan Dela Cruz",
      vehicle: "ABC-123",
      destination: "Head office",
    },
    new Date("2026-10-14T00:00:00Z"),
  );
  const text = bytes.toString("ascii");
  assert.equal(text.split("Guards' Copy").length - 1, 1);
  assert.equal(text.split("Requester's Copy").length - 1, 1);
  assert.equal(text.split("Ticket No.: TT-1").length - 1, 2);
  assert.equal(text.split("Mileage Before:").length - 1, 1);
  assert.equal(text.split("Vehicle Plate No.:").length - 1, 1);
  assert.equal(
    text.split(Buffer.from([0x1d, 0x56, 0]).toString("ascii")).length - 1,
    2,
  );
});

test("receipt fields wrap long words and cannot inject printer commands", () => {
  const lines = wrapReceiptText(
    `Office\x1b\x40 ${"x".repeat(95)} next destination`,
  );
  assert.ok(lines.every((line) => line.length <= 42));
  assert.ok(lines.every((line) => !line.includes("\x1b")));
  assert.match(lines.join(" "), /next destination/);
});

test("temporary credentials print as one private receipt with a single cut", () => {
  const bytes = accountCredentialsBytes({
    email: "juan@embcapital.local",
    password: "EMB-123456",
  });
  const text = bytes.toString("ascii");
  assert.match(text, /Temporary Password/);
  assert.match(text, /juan@embcapital.local/);
  assert.match(text, /EMB-123456/);
  assert.match(text, /CAUTION:/);
  assert.equal(
    text.split(Buffer.from([0x1d, 0x56, 0]).toString("ascii")).length - 1,
    1,
  );
});
