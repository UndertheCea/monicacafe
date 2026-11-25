// "Try again" keeps focus in its section (#512). Run with `npm test`.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { retryFocusStep } from "../lib/retryFocus.ts";

test("retryFocusStep: heading while loading, the new Try again on a second failure, else hands off", () => {
  const cases = [
    // focusLost, onHeading, hasRetry, want
    [true, false, false, "heading"], // the button unmounted: wait on the heading
    [true, false, true, "retry"], // failed again before the heading took focus
    [false, true, false, "wait"], // still loading (or loaded): keep watching
    [false, true, true, "retry"], // failed again: focus the new Try again
    [false, false, false, "stop"], // the visitor moved on
    [false, false, true, "stop"],
  ];
  for (const [focusLost, onHeading, hasRetry, want] of cases) {
    assert.equal(retryFocusStep({ focusLost, onHeading, hasRetry }), want, JSON.stringify({ focusLost, onHeading, hasRetry }));
  }
});

test("every in-page Try again is a RetryButton", () => {
  const root = new URL("..", import.meta.url).pathname;
  const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
  // Page-level crashes reload the whole page (ErrorState, app/error.tsx): nothing to keep focus in.
  const allowed = new Set(["components/RetryButton.tsx", "components/ErrorState.tsx", "app/error.tsx"]);
  const out = [...walk(join(root, "components")), ...walk(join(root, "app"))]
    .filter((p) => /\.tsx$/.test(p) && !allowed.has(relative(root, p)))
    .filter((p) => readFileSync(p, "utf8").includes('"crash.retry"'))
    .map((p) => relative(root, p));
  assert.deepEqual(out, []);
});
