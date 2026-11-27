// The checkable parts of docs/FRONTEND_DESIGN.md (#553): the signs that make a page look generated rather than
// designed. palette.test.mjs covers colour, gradients and shadows; contrast.test.mjs the text tokens. Run with `npm test`.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { DICTS } from "../lib/i18n/dict.ts";

const root = new URL("..", import.meta.url).pathname;

function sources(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.(tsx?|css)$/.test(p)) out.push(p);
  }
  return out;
}

const files = ["app", "components", "lib"].flatMap((d) => sources(join(root, d)));

function offenders(re, skip = () => false) {
  const out = [];
  for (const p of files) {
    if (skip(relative(root, p))) continue;
    readFileSync(p, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (/^\s*(?:\/\/|\/?\*)/.test(line)) return; // comments may name the rule they follow
        if (re.test(line)) out.push(`${relative(root, p)}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
  }
  return out;
}

test("no pictographic emoji in the interface (text glyphs like ♡ ✓ ☰ are fine)", () => {
  assert.deepEqual(offenders(/[\u{1F300}-\u{1FAFF}\u{2728}\u{2B50}\u{2705}\u{274C}\u{26A0}\u{1F000}-\u{1F2FF}]/u), []);
});

test("motion: no transition-all, hover scale, bounce, ping or spin; pulse only under motion-safe", () => {
  assert.deepEqual(offenders(/\btransition-all\b/), []);
  assert.deepEqual(offenders(/(?:^|[\s"'`:])(?:[a-z-]+:)*scale-(?:10[1-9]|11\d|12\d|1[3-9]\d)\b/), []);
  assert.deepEqual(offenders(/\banimate-(?:bounce|ping|spin)\b/), []);
  assert.deepEqual(offenders(/(?<!motion-safe:)\banimate-pulse\b/), []);
});

test("heavy and italic type belong to the wordmark only", () => {
  const wordmark = (p) => p === "components/Wordmark.tsx" || p === "app/not-found.tsx" || p === "app/layout.tsx";
  assert.deepEqual(offenders(/\bfont-(?:extrabold|black)\b/, wordmark), []);
  assert.deepEqual(offenders(/(?:^|[\s"'`:])italic\b/, wordmark), []);
});

test("arbitrary pixel values sit on the 4 px grid", () => {
  const out = [];
  for (const line of offenders(/-\[\d+(?:\.\d+)?px\]/)) {
    for (const m of line.matchAll(/-\[(\d+(?:\.\d+)?)px\]/g)) {
      if (Number(m[1]) % 4 !== 0) out.push(line);
    }
  }
  assert.deepEqual(out, []);
});

test("no hype words or unverifiable claims in either language", () => {
  const HYPE = /seamless|supercharge|unlock|magic|revolution|game[- ]chang|effortless|ai[- ]powered|trusted by|loved by|world[- ]class|革命|神奇|無縫/i;
  for (const [locale, dict] of Object.entries(DICTS)) {
    const bad = Object.entries(dict).filter(([, v]) => HYPE.test(v));
    assert.deepEqual(bad, [], locale);
  }
});

// Strings that still end with "!" / "！" when this test was added; #552 option E removes them. Never add a key here.
const KNOWN_EXCLAIMS = new Set(["account.noComments", "comments.empty", "dash.noCoffees", "report.done"]);

test("no new exclamation marks in interface text", () => {
  for (const [locale, dict] of Object.entries(DICTS)) {
    const bad = Object.entries(dict)
      .filter(([k, v]) => /[!！]/.test(v) && !KNOWN_EXCLAIMS.has(k))
      .map(([k]) => k);
    assert.deepEqual(bad, [], locale);
  }
});

test("the design guide exists and CLAUDE.md points to it", () => {
  const guide = readFileSync(join(root, "..", "docs", "FRONTEND_DESIGN.md"), "utf8");
  for (const h of ["## Direction", "## Colour", "## Type", "## Spacing and layout", "## Components", "## Copy", "## Motion"]) {
    assert.ok(guide.includes(h), h);
  }
  assert.match(guide, /unslop\W{0,4} by Damir Sokolovsky/, "CC BY 4.0 credit");
  assert.match(readFileSync(join(root, "..", "CLAUDE.md"), "utf8"), /docs\/FRONTEND_DESIGN\.md/);
});
