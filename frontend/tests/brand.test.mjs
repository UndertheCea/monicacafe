// Brand name + wordmark (#110). Run with `npm test`.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { BRAND_NAME, WORDMARK, pageTitle } from "../lib/brand.ts";

const root = new URL("..", import.meta.url).pathname;

test("the wordmark reads 'moni cafe' and its accessible name is 'Moni Cafe'", () => {
  assert.equal(BRAND_NAME, "Moni Cafe");
  assert.equal(WORDMARK.label, BRAND_NAME);
  assert.equal(`${WORDMARK.main} ${WORDMARK.sub}`, BRAND_NAME.toLowerCase());
});

test("pageTitle: the brand alone on the home page, 'X | Moni Cafe' elsewhere", () => {
  const cases = [
    [undefined, "Moni Cafe"],
    ["", "Moni Cafe"],
    ["  ", "Moni Cafe"],
    ["Geisha", "Geisha | Moni Cafe"],
    ["%s", "%s | Moni Cafe"],
  ];
  for (const [title, want] of cases) assert.equal(pageTitle(title), want, String(title));
});

// Owner on #159: "never display 台灣精品咖啡市集; people should know the brand is called moni cafe".
test("the marketplace tagline is displayed nowhere (#159, #194)", () => {
  const banned = /台灣精品咖啡市集|台湾精品咖啡市集|specialty[- ]coffee marketplace/i;
  const walk = (dir) =>
    readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : /\.(ts|tsx|css)$/.test(e.name) ? [join(dir, e.name)] : [],
    );
  for (const f of ["app", "components", "lib"].flatMap(walk)) {
    assert.doesNotMatch(readFileSync(join(root, f), "utf8"), banned, f);
  }
});

test("header and footer both render the wordmark; no shouty 'MONI CAFE' remains", () => {
  for (const f of ["components/SiteHeader.tsx", "components/SiteFooter.tsx"]) {
    assert.match(readFileSync(join(root, f), "utf8"), /<Wordmark\b/, f);
  }
  for (const f of ["app/layout.tsx", "lib/seo.ts", "lib/i18n/dict.ts", "components/SiteHeader.tsx"]) {
    assert.doesNotMatch(readFileSync(join(root, f), "utf8"), /MONI CAFE/, f);
  }
});

test("the header wordmark has no tagline and sets 'cafe' at the size of 'moni' (#164)", () => {
  const header = readFileSync(join(root, "components/SiteHeader.tsx"), "utf8");
  assert.match(header, /<Wordmark \/>/);
  assert.doesNotMatch(header, /brand\.tagline/);
  const mark = readFileSync(join(root, "components/Wordmark.tsx"), "utf8");
  assert.doesNotMatch(mark, /\bsub\?:|\{sub\b/, "no tagline prop");
  // One shared size class on the element that wraps both words; no smaller text size on "cafe".
  assert.match(mark, /<span>\{WORDMARK\.main\}<\/span>\s*<span>\{WORDMARK\.sub\}<\/span>/);
  assert.doesNotMatch(mark, /text-\[0\.\d+rem\]/, "no small second line");
});
