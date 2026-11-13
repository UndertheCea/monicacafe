// Refresh cookie + Origin check from SITE_URL (#215), CSP reporting.
import assert from "node:assert/strict";
import { test } from "node:test";
import { originAllowed, readRefreshToken, refreshCookie } from "../lib/auth/cookie.ts";
import { buildCsp, REPORTING_ENDPOINTS } from "../lib/csp.ts";
import { isReportContentType, summariseReports } from "../lib/cspReport.ts";

test("refreshCookie: __Host- and Secure only on an https SITE_URL", () => {
  const host = { name: "__Host-mc_rt", path: "/", secure: true };
  const plain = { name: "mc_rt", path: "/api/auth", secure: false };
  for (const [url, want] of [
    ["https://moni.example", host],
    ["https://moni.example/", host],
    ["http://localhost", plain],
    ["http://localhost:3000", plain],
    [undefined, plain],
    ["", plain],
    ["nonsense", plain],
  ]) assert.deepEqual(refreshCookie(url), want, String(url));
});

test("readRefreshToken: new name first, legacy name as fallback", () => {
  const jar = (o) => (n) => o[n];
  assert.equal(readRefreshToken(jar({ "__Host-mc_rt": "new", mc_rt: "old" }), "https://a.example"), "new");
  assert.equal(readRefreshToken(jar({ mc_rt: "old" }), "https://a.example"), "old");
  assert.equal(readRefreshToken(jar({ mc_rt: "old" }), "http://localhost"), "old");
  assert.equal(readRefreshToken(jar({ "__Host-mc_rt": "new" }), "http://localhost"), undefined);
  assert.equal(readRefreshToken(jar({}), "https://a.example"), undefined);
});

test("originAllowed matrix", () => {
  const site = "https://moni.example";
  const cases = [
    [{ origin: "https://moni.example", secFetchSite: "same-origin" }, true],
    [{ origin: "https://moni.example", secFetchSite: null }, true],
    [{ origin: "https://evil.example", secFetchSite: null }, false],
    [{ origin: "https://evil.example", secFetchSite: "same-origin" }, false],
    [{ origin: "http://moni.example", secFetchSite: null }, false], // scheme differs
    [{ origin: "https://moni.example", secFetchSite: "cross-site" }, false],
    [{ origin: "https://moni.example", secFetchSite: "same-site" }, false],
    [{ origin: null, secFetchSite: null }, true], // curl, smoke.sh
    [{ origin: null, secFetchSite: "same-origin" }, false], // browser without Origin
    [{ origin: "null", secFetchSite: null }, false],
    [{ origin: "garbage", secFetchSite: null }, false],
    [{ origin: "http://localhost:3000", secFetchSite: null }, false], // dev only
    [{ origin: "http://localhost:3000", secFetchSite: null, dev: true }, true],
  ];
  for (const [input, want] of cases) assert.equal(originAllowed({ siteUrl: site, ...input }), want, JSON.stringify(input));
  assert.equal(originAllowed({ origin: "http://localhost", secFetchSite: null, siteUrl: undefined }), true);
});

const base = { nonce: "n", dev: false, graphqlUrl: "/graphql", mediaUrl: "" };

test("CSP: upgrade-insecure-requests only for https SITE_URL", () => {
  assert.match(buildCsp({ ...base, siteUrl: "https://moni.example" }), /; upgrade-insecure-requests(;|$)/);
  assert.doesNotMatch(buildCsp({ ...base, siteUrl: "http://localhost" }), /upgrade-insecure-requests/);
  assert.doesNotMatch(buildCsp(base), /upgrade-insecure-requests/);
});

test("CSP: reporting directives", () => {
  const csp = buildCsp(base);
  assert.match(csp, /report-uri \/api\/csp-report/);
  assert.match(csp, /report-to csp/);
  assert.equal(REPORTING_ENDPOINTS, 'csp="/api/csp-report"');
});

test("CSP report parsing", () => {
  assert.equal(isReportContentType("application/csp-report"), true);
  assert.equal(isReportContentType("application/reports+json; charset=utf-8"), true);
  assert.equal(isReportContentType("application/json"), false);
  assert.equal(isReportContentType(null), false);
  assert.deepEqual(
    summariseReports(
      JSON.stringify({
        "csp-report": { "document-uri": "https://a/", "violated-directive": "img-src", "blocked-uri": "https://x/i.png" },
      }),
    ),
    [{ type: "csp-violation", documentURI: "https://a/", violatedDirective: "img-src", blockedURI: "https://x/i.png" }],
  );
  assert.deepEqual(
    summariseReports(
      JSON.stringify([{ type: "csp-violation", url: "https://a/", body: { effectiveDirective: "script-src", blockedURL: "inline" } }]),
    ),
    [{ type: "csp-violation", documentURI: "https://a/", violatedDirective: "script-src", blockedURI: "inline" }],
  );
  assert.deepEqual(summariseReports("not json"), []);
  assert.deepEqual(summariseReports("42"), []);
});
