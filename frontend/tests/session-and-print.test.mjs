import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

// Load the actual browser services without a running Next server.
async function loadService(file) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
  );
}
const service = await loadService("../services/api.ts");

test("protected JSON requests signal session expiry and retain the 401 error", async () => {
  const originalFetch = globalThis.fetch;
  const events = [];
  globalThis.window = { dispatchEvent: (event) => events.push(event.type) };
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.credentials, "include");
    return new Response(
      JSON.stringify({ error: "Authentication is required." }),
      { status: 401 },
    );
  };
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:5001/api";
  try {
    await assert.rejects(
      service.api("/store?page=pending"),
      (error) => error.status === 401,
    );
    assert.deepEqual(events, [service.SESSION_EXPIRED_EVENT]);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.window;
  }
});

test("failed login, RFID errors, permission errors and outages do not signal logout", async () => {
  const events = [];
  globalThis.window = { dispatchEvent: (event) => events.push(event.type) };
  const originalFetch = globalThis.fetch;
  try {
    service.checkSessionResponse(
      new Response(null, { status: 401 }),
      "/auth/login",
    );
    service.checkSessionResponse(
      new Response(null, { status: 401 }),
      "/rfid/scan",
    );
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: "Please scan an employee ID card to continue.",
        }),
        { status: 401 },
      );
    await assert.rejects(
      service.api("/request/TT-1/action", { sessionRequired: false }),
      (error) => error.status === 401,
    );
    service.checkSessionResponse(
      new Response(null, { status: 403 }),
      "/reports/requests.csv",
    );
    service.checkSessionResponse(
      new Response(null, { status: 500 }),
      "/auth/session",
    );
    globalThis.fetch = async () => {
      throw new Error("Offline");
    };
    await assert.rejects(
      service.api("/auth/session"),
      (error) => error.status === 0,
    );
    assert.deepEqual(events, []);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.window;
  }
});

test("session checks and CSV downloads signal expired cookies", () => {
  const events = [];
  globalThis.window = { dispatchEvent: (event) => events.push(event.type) };
  try {
    for (const path of ["/auth/session", "/reports/requests.csv"])
      service.checkSessionResponse(new Response(null, { status: 401 }), path);
    assert.deepEqual(events, [
      service.SESSION_EXPIRED_EVENT,
      service.SESSION_EXPIRED_EVENT,
    ]);
  } finally {
    delete globalThis.window;
  }
});
