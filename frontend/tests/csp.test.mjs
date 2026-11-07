// Content-Security-Policy builder (lib/csp.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DENIED_FEATURES, MAP_TILE_ORIGIN, buildCsp, buildPermissionsPolicy, originOf } from "../lib/csp.ts";

const directives = (csp) =>
  Object.fromEntries(
    csp.split(";").map((d) => {
      const [k, ...v] = d.trim().split(/\s+/);
      return [k, v];
    }),
  );

test("originOf", () => {
  const cases = [
    ["http://localhost/graphql", "http://localhost"],
    ["http://localhost:4000/graphql", "http://localhost:4000"],
    ["https://cdn.example.com/m/", "https://cdn.example.com"],
    ["/graphql", null],
    ["javascript:alert(1)", null],
    ["", null],
  ];
  for (const [input, want] of cases) assert.equal(originOf(input), want, input);
});

test("production policy (compose: everything same-origin)", () => {
  const d = directives(
    buildCsp({ nonce: "abc", dev: false, graphqlUrl: "http://localhost/graphql", mediaUrl: "http://localhost/media" }),
  );
  assert.deepEqual(d["script-src"], ["'self'", "'nonce-abc'", "'strict-dynamic'"]);
  assert.deepEqual(d["img-src"], ["'self'", "data:", "blob:", "http://localhost", MAP_TILE_ORIGIN]);
  assert.deepEqual(d["connect-src"], ["'self'", "http://localhost"]);
  assert.deepEqual(d["frame-ancestors"], ["'none'"]);
  assert.deepEqual(d["object-src"], ["'none'"]);
  assert.ok(!d["script-src"].includes("'unsafe-inline'"));
  assert.ok(!d["script-src"].includes("'unsafe-eval'"));
});

test("dev policy (next dev on :3000, API on :4000, CDN media)", () => {
  const d = directives(
    buildCsp({
      nonce: "n1",
      dev: true,
      graphqlUrl: "http://localhost:4000/graphql",
      mediaUrl: "https://cdn.example.com/media",
    }),
  );
  assert.ok(d["script-src"].includes("'unsafe-eval'"));
  assert.deepEqual(d["connect-src"], ["'self'", "http://localhost:4000", "https://cdn.example.com", "ws:", "wss:"]);
  assert.ok(d["img-src"].includes("https://cdn.example.com"));
});

test("relative or bad URLs add no hosts", () => {
  const d = directives(buildCsp({ nonce: "x", dev: false, graphqlUrl: "/graphql", mediaUrl: "nope" }));
  assert.deepEqual(d["connect-src"], ["'self'"]);
  assert.deepEqual(d["img-src"], ["'self'", "data:", "blob:", MAP_TILE_ORIGIN]);
});

test("buildPermissionsPolicy denies each feature with an empty allowlist", () => {
  const cases = [
    ["default", undefined, "camera=(), microphone=(), geolocation=(), payment=(), usb=()"],
    ["one", ["camera"], "camera=()"],
    ["deduped", ["usb", "usb"], "usb=()"],
    ["none", [], ""],
  ];
  for (const [name, input, want] of cases) assert.equal(buildPermissionsPolicy(input), want, name);
  for (const f of ["camera", "microphone", "geolocation"]) assert.ok(DENIED_FEATURES.includes(f), f);
});
