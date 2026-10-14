import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
process.env.DATABASE_URL ??= "mysql://unused:unused@localhost:3306/unused";
process.env.PORT ??= "5001";
process.env.JWT_SECRET ??= "test-only-session-secret-at-least-24-characters";
const { ENV } = await import("../config/env.js");
const { optionalAuth, requireAuth } = await import("./auth.middleware.js");

test("missing, expired, forged and malformed session cookies receive 401", () => {
  const tokens = [
    undefined,
    "invalid",
    jwt.sign({ userId: "test" }, ENV.JWT_SECRET, { expiresIn: -1 }),
    jwt.sign({ userId: "test" }, "wrong-secret"),
  ];
  for (const token of tokens) {
    const req = { cookies: { EMB_TTR_SESSION: token } } as unknown as Request;
    let status = 0;
    const res = {
      status: (value: number) => {
        status = value;
        return res;
      },
      json: () => undefined,
    } as unknown as Response;
    optionalAuth(req, res, () => undefined);
    requireAuth(req, res, () =>
      assert.fail("Invalid cookie must not authenticate"),
    );
    assert.equal(status, 401);
  }
});

test("a valid session cookie continues through the protected middleware", () => {
  const req = {
    cookies: {
      EMB_TTR_SESSION: jwt.sign({ userId: "test" }, ENV.JWT_SECRET, {
        expiresIn: 60,
      }),
    },
  } as unknown as Request;
  let continued = false;
  optionalAuth(req, {} as Response, () => undefined);
  requireAuth(req, {} as Response, () => {
    continued = true;
  });
  assert.equal(req.auth?.userId, "test");
  assert.equal(continued, true);
});
