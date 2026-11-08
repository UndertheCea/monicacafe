// Brand name + wordmark (#110). Run with `npm test`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { BRAND_NAME, WORDMARK, pageTitle } from "../lib/brand.ts";

const root = new URL("..", import.meta.url).pathname;

test("the wordmark reads 'moni cafe' and its accessible name is 'Moni Cafe'", () => {
  assert.equal(BRAND_NAME, "Moni Cafe");
  assert.equal(WORDMARK.label, BRAND_NAME);
  assert.equal(`${WORDMARK.main} ${WORDMARK.sub}`, BRAND_NAME.toLowerCase());
});

test("pageTitle: brand + tagline on the home page, 'X | Moni Cafe' elsewhere", () => {
  const cases = [
    [undefined, "台灣精品咖啡市集", "Moni Cafe — 台灣精品咖啡市集"],
    ["", "tagline", "Moni Cafe — tagline"],
    ["  ", "tagline", "Moni Cafe — tagline"],
    ["Geisha", "tagline", "Geisha | Moni Cafe"],
    ["%s", "", "%s | Moni Cafe"],
  ];
  for (const [title, tagline, want] of cases) assert.equal(pageTitle(title, tagline), want, String(title));
});

test("header and footer both render the wordmark; no shouty 'MONI CAFE' remains", () => {
  for (const f of ["components/SiteHeader.tsx", "components/SiteFooter.tsx"]) {
    assert.match(readFileSync(join(root, f), "utf8"), /<Wordmark\b/, f);
  }
  for (const f of ["app/layout.tsx", "lib/seo.ts", "lib/i18n/dict.ts", "components/SiteHeader.tsx"]) {
    assert.doesNotMatch(readFileSync(join(root, f), "utf8"), /MONI CAFE/, f);
  }
});
