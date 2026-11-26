// Unit tests for lib/rate-limit.ts. Run: npm run test:lib
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLimiter } from "../../lib/rate-limit.ts";

test("allows up to max hits in the window, then says how long to wait", () => {
  const l = createLimiter(3, 60_000);
  assert.equal(l.hit("u1", 0), 0);
  assert.equal(l.hit("u1", 1000), 0);
  assert.equal(l.hit("u1", 2000), 0);
  assert.equal(l.hit("u1", 3000), 57); // oldest hit (t = 0) leaves the window at 60 s
  assert.equal(l.hit("u2", 3000), 0, "other users are counted separately");
});

test("refused hits don't count, and old hits slide out", () => {
  const l = createLimiter(2, 60_000);
  l.hit("u", 0); l.hit("u", 10_000);
  assert.ok(l.hit("u", 20_000) > 0);
  assert.ok(l.hit("u", 30_000) > 0);
  assert.equal(l.hit("u", 60_000), 0, "the t = 0 hit has left the window");
  assert.ok(l.hit("u", 61_000) > 0, "t = 10 s and t = 60 s are still inside");
});
