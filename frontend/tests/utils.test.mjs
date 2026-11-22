// lib/utils.ts: NT$ and Taipei date formatting (#473). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { formatTWD, formatTaipeiDate } from "../lib/utils.ts";

test("formatTaipeiDate is year/month/day in Taipei time", () => {
  const cases = [
    ["2026-11-04T03:00:00Z", "2026/11/04"],
    // 16:30 UTC is already the next day in Taipei (UTC+8).
    ["2026-11-04T16:30:00Z", "2026/11/05"],
    ["2026-12-31T16:00:00Z", "2027/01/01"],
    ["2026-01-05T00:00:00+08:00", "2026/01/05"],
    ["not a date", ""],
    ["", ""],
  ];
  for (const [iso, want] of cases) assert.equal(formatTaipeiDate(iso), want, iso);
});

test("formatTWD groups thousands without decimals", () => {
  const cases = [
    [0, "0"],
    [450, "450"],
    [1200, "1,200"],
    [10000000, "10,000,000"],
  ];
  for (const [n, want] of cases) assert.equal(formatTWD(n), want, String(n));
});
