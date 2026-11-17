// Seller write refusals (lib/dashboard/writeError.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { dashWriteError } from "../lib/dashboard/writeError.ts";

test("dashWriteError names suspension, takedown and rate limits", () => {
  assert.deepEqual(dashWriteError("SHOP_SUSPENDED"), { key: "dash.error.shopSuspended" });
  assert.deepEqual(dashWriteError("TAKEN_DOWN"), { key: "dash.error.takenDown" });
  assert.deepEqual(dashWriteError("RATE_LIMITED", 30), { key: "error.rateLimitedSec.other", vars: { n: 30 } });
  assert.deepEqual(dashWriteError("RATE_LIMITED", 61), { key: "error.rateLimitedMin.other", vars: { n: 2 } });
  assert.deepEqual(dashWriteError("RATE_LIMITED"), { key: "error.rateLimitedMin.one", vars: { n: 1 } });
});

test("dashWriteError leaves other codes to the form", () => {
  for (const code of ["BAD_USER_INPUT", "CONFLICT", "FORBIDDEN", "UNAVAILABLE", "INTERNAL_SERVER_ERROR"]) {
    assert.equal(dashWriteError(code, 10), null, code);
  }
});
