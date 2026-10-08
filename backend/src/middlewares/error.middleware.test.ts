import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { errorHandler } from "./error.middleware.js";

test("JSON parser failures return 400 without leaking request bodies", async () => {
  const app = express();
  app.use(express.json());
  let handled = 0;
  app.post("/position", (req, res) => { handled++; res.json(req.body); });
  app.use(errorHandler);
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    for (const body of ["null", '"secret-value"', '{"deviceKey":"secret-value",']) {
      const response: Response = await fetch(`http://127.0.0.1:${address.port}/position`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body,
      });
      assert.equal(response.status, 400);
      const payload = await response.json();
      assert.equal(payload.ok, false);
      assert.match(payload.error, /JSON object/);
      assert.equal(JSON.stringify(payload).includes("secret-value"), false);
    }
    assert.equal(handled, 0);
    const response: Response = await fetch(`http://127.0.0.1:${address.port}/position`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "tracker", hasFix: false }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { deviceId: "tracker", hasFix: false });
    assert.equal(handled, 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
