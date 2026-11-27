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
  // By name only (#560): a bare `transition` animates whatever changes, and layout properties never animate.
  assert.deepEqual(offenders(/(?:^|[\s"'`:])transition(?=[\s"'`]|$)/), []);
  assert.deepEqual(offenders(/\btransition-\[[^\]]*\b(?:width|height|top|left|right|bottom|margin|padding)\b/), []);
});

test("cards and panels share one padding: p-4 in lists, p-6 for panels (#560)", () => {
  assert.deepEqual(offenders(/(?:^|[\s"'`:])p-5(?=[\s"'`]|$)/), []);
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

test("no exclamation marks in interface text (#552 E)", () => {
  for (const [locale, dict] of Object.entries(DICTS)) {
    const bad = Object.entries(dict)
      .filter(([, v]) => /[!！]/.test(v))
      .map(([k]) => k);
    assert.deepEqual(bad, [], locale);
  }
});

// One sentence = exactly one sentence end, and it is the last character. Paragraph copy (`…Body`, `….body`) and the
// meta description (`site.*`) are prose and keep theirs; strings of two or more sentences keep every stop.
const sentenceEnds = (v) => (v.match(/[。！？]|[.!?](?=\s|$)/g) || []).length;
const isProse = (k) => /Body$|\.body$|^site\./.test(k);

test("one-line notes have no full stop (#552 E)", () => {
  for (const [locale, dict] of Object.entries(DICTS)) {
    const bad = Object.entries(dict)
      .filter(([k, v]) => !isProse(k) && sentenceEnds(v) === 1 && /(。|[^.]\.)$/.test(v))
      .map(([k]) => k);
    assert.deepEqual(bad, [], locale);
  }
});

test("no dictionary string ends with a colon: a note never leads into markup after it (#561)", () => {
  for (const [locale, dict] of Object.entries(DICTS)) {
    const bad = Object.entries(dict)
      .filter(([, v]) => /[:：]$/.test(v))
      .map(([k]) => k);
    assert.deepEqual(bad, [], locale);
  }
});

test("page titles mean the same in both languages (#561)", () => {
  // 精選 ("featured") on a list that isn't curated was a claim the English didn't make.
  assert.equal(DICTS["zh-TW"]["shops.title"], "店家");
  assert.equal(DICTS.en["shops.title"], "Shops");
  assert.equal(DICTS["zh-TW"]["img.galleryTitle"], "照片");
});

test("the full-stop rule's helpers see sentences the way the copy guide means", () => {
  const cases = [
    ["購物車是空的。", 1],
    ["購物車載入失敗，請再試一次", 0],
    ["Couldn't load your cart. Please try again.", 2],
    ["Wait…", 0],
    ["Rated 4.5 by tasters", 0],
  ];
  for (const [v, n] of cases) assert.equal(sentenceEnds(v), n, v);
  assert.ok(isProse("home.why1Body") && isProse("notFound.body") && isProse("site.description"));
  assert.ok(!isProse("cart.empty"));
});

test("the design guide exists and CLAUDE.md points to it", () => {
  const guide = readFileSync(join(root, "..", "docs", "FRONTEND_DESIGN.md"), "utf8");
  for (const h of ["## Direction", "## Colour", "## Type", "## Spacing and layout", "## Components", "## Copy", "## Motion"]) {
    assert.ok(guide.includes(h), h);
  }
  assert.match(guide, /unslop\W{0,4} by Damir Sokolovsky/, "CC BY 4.0 credit");
  assert.match(readFileSync(join(root, "..", "CLAUDE.md"), "utf8"), /docs\/FRONTEND_DESIGN\.md/);
});
