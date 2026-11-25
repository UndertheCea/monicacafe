// Server-side fetch timeout (lib/fetch-timeout.ts, #529). Run with `npm test`.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { SERVER_FETCH_TIMEOUT_MS, withTimeout } from "../lib/fetch-timeout.ts";

// AbortSignal.timeout timers are unref'd; keep the event loop alive while a test waits on one.
const keepAlive = setInterval(() => {}, 100);
after(() => clearInterval(keepAlive));

// A fetch that never answers but rejects when its signal aborts, like the real one.
const hanging = (_input, init) =>
  new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason));
  });

test("the default timeout is 8 s", () => {
  assert.equal(SERVER_FETCH_TIMEOUT_MS, 8000);
});

test("withTimeout aborts a request that never answers", async () => {
  await assert.rejects(withTimeout(hanging, 20)("http://x/graphql", {}), (e) => e.name === "TimeoutError");
});

test("withTimeout passes the response through and keeps the other init fields", async () => {
  let seen;
  const ok = new Response("{}");
  const f = withTimeout(async (_i, init) => {
    seen = init;
    return ok;
  }, 1000);
  assert.equal(await f("http://x", { method: "POST" }), ok);
  assert.equal(seen.method, "POST");
  assert.ok(seen.signal instanceof AbortSignal);
});

test("withTimeout still honours the caller's own signal", async () => {
  const ctl = new AbortController();
  const p = withTimeout(hanging, 5000)("http://x", { signal: ctl.signal });
  ctl.abort(new DOMException("gone", "AbortError"));
  await assert.rejects(p, (e) => e.name === "AbortError");
});
