// Error reporting + health payload helpers (lib/errorReport.ts, lib/health.ts, #221). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEnvelope, parseDsn, pathOnly, scrub } from "../lib/errorReport.ts";
import { apiReadyUrl, healthResponse } from "../lib/health.ts";

test("parseDsn", () => {
  const cases = [
    ["", null],
    [undefined, null],
    ["not a dsn", null],
    ["https://o1.ingest.sentry.io/42", null], // no key
    ["https://k@o1.ingest.sentry.io/", null], // no project
    ["https://k@o1.ingest.sentry.io/abc", null],
    ["ftp://k@host/1", null],
    ["https://abc123@o1.ingest.sentry.io/42", { endpoint: "https://o1.ingest.sentry.io/api/42/envelope/", key: "abc123" }],
    ["https://k@errors.example.com/sentry/7", { endpoint: "https://errors.example.com/sentry/api/7/envelope/", key: "k" }],
  ];
  for (const [input, want] of cases) assert.deepEqual(parseDsn(input), want, String(input));
});

test("scrub removes personal data and credentials", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl";
  const cases = [
    ["Key (email)=(ann@example.com) already exists", "ann@example.com"],
    [`bad token ${jwt}`, jwt],
    ["Authorization: Bearer abc.DEF-123_xyz", "abc.DEF-123_xyz"],
    ['password="hunter2 hunter3"', "hunter2"],
    ["refresh_token=abcdef123456", "abcdef123456"],
    ["dial postgres://monica:monica_secret@db:5432/x", "monica_secret"],
    [`key ${"ab12".repeat(12)}`, "ab12ab12ab12ab12"],
  ];
  for (const [input, secret] of cases) {
    assert.ok(!scrub(input).includes(secret), `${secret} survived in ${scrub(input)}`);
  }
  assert.equal(scrub("Cannot read properties of undefined (reading 'id')"), "Cannot read properties of undefined (reading 'id')");
});

test("pathOnly drops query and fragment", () => {
  const cases = [
    ["/coffees?token=abc&q=x", "/coffees"],
    ["/shops/a#top", "/shops/a"],
    ["/menu", "/menu"],
  ];
  for (const [input, want] of cases) assert.equal(pathOnly(input), want);
});

test("buildEnvelope carries the error and nothing identifying", () => {
  const body = buildEnvelope(
    {
      error: { name: "TypeError", message: "boom for ann@example.com", stack: "at x\nsecret=abc", digest: "123" },
      method: "GET",
      path: "/coffees?session=SECRET",
      routeType: "render",
      environment: "production",
      release: "r1",
    },
    new Date("2026-01-02T03:04:05.678Z"),
  );
  const lines = body.trimEnd().split("\n");
  assert.equal(lines.length, 3);
  assert.deepEqual(JSON.parse(lines[1]), { type: "event" });
  const ev = JSON.parse(lines[2]);
  assert.equal(ev.timestamp, "2026-01-02T03:04:05Z");
  assert.equal(ev.environment, "production");
  assert.equal(ev.release, "r1");
  assert.equal(ev.request.url, "/coffees");
  assert.equal(ev.tags.digest, "123");
  assert.equal(ev.exception.values[0].type, "TypeError");
  assert.equal(ev.user, undefined);
  for (const leak of ["ann@example.com", "secret=abc", "SECRET"]) assert.ok(!body.includes(leak), `${leak} leaked`);
});

test("apiReadyUrl and healthResponse", () => {
  assert.equal(apiReadyUrl("http://backend:4000/graphql"), "http://backend:4000/health/ready");
  assert.equal(apiReadyUrl("https://api.moni.example/graphql"), "https://api.moni.example/health/ready");
  const cases = [
    [["abc", true], { status: 200, body: { status: "ok", build: "abc", api: "up" } }],
    [["abc", false], { status: 503, body: { status: "degraded", build: "abc", api: "down" } }],
    [["", true], { status: 200, body: { status: "ok", build: "unknown", api: "up" } }],
  ];
  for (const [args, want] of cases) assert.deepEqual(healthResponse(...args), want);
});
