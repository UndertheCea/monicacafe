// Seller write refusals (lib/dashboard/writeError.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { dashWriteError, publishToggleError, reorderError } from "../lib/dashboard/writeError.ts";

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

test("publishToggleError: shared refusals first, then the toggle's own message (#489)", () => {
  assert.deepEqual(publishToggleError("RATE_LIMITED", 30, true), { key: "error.rateLimitedSec.other", vars: { n: 30 } });
  assert.deepEqual(publishToggleError("SHOP_SUSPENDED", undefined, false), { key: "dash.error.shopSuspended" });
  assert.deepEqual(publishToggleError("TAKEN_DOWN", undefined, true), { key: "dash.error.takenDown" });
  assert.deepEqual(publishToggleError("BAD_USER_INPUT", undefined, true), { key: "dash.error.publishNeedsVariant" });
  assert.deepEqual(publishToggleError("BAD_USER_INPUT", undefined, false), { key: "dash.error.generic" });
  assert.deepEqual(publishToggleError("UNAVAILABLE", undefined, true), { key: "dash.error.generic" });
});

test("reorderError: shared refusals first, else the reorder message (#489)", () => {
  assert.deepEqual(reorderError("SHOP_SUSPENDED"), { key: "dash.error.shopSuspended" });
  assert.deepEqual(reorderError("RATE_LIMITED", 61), { key: "error.rateLimitedMin.other", vars: { n: 2 } });
  assert.deepEqual(reorderError("BAD_USER_INPUT"), { key: "dash.error.reorder" });
  assert.deepEqual(reorderError("UNAVAILABLE"), { key: "dash.error.reorder" });
});
