// The no-JavaScript language switch's form parsing (lib/i18n/localeForm.ts, #367).
import assert from "node:assert/strict";
import { test } from "node:test";
import { localeCookieString, nextWithSearch, parseLocaleForm } from "../lib/i18n/localeForm.ts";

test("parseLocaleForm validates the locale and the next path", () => {
  const cases = [
    ["en", "/menu", { locale: "en", next: "/menu" }],
    ["zh-TW", "/coffees?q=a", { locale: "zh-TW", next: "/coffees?q=a" }],
    ["en", "https://evil.example", { locale: "en", next: "/" }],
    ["en", "//evil.example", { locale: "en", next: "/" }],
    ["en", "/\t/evil.example", { locale: "en", next: "/" }],
    ["en", null, { locale: "en", next: "/" }],
    ["fr", "/menu", null],
    ["", "/menu", null],
    [null, "/menu", null],
  ];
  for (const [locale, next, want] of cases) {
    assert.deepEqual(parseLocaleForm(locale, next), want, `${locale} ${next}`);
  }
});

test("the cookie string matches what the script path always wrote", () => {
  assert.equal(localeCookieString("locale", "en"), "locale=en; path=/; max-age=31536000; samesite=lax");
});

test("nextWithSearch joins path and query, and the result still validates", () => {
  const cases = [
    ["/coffees", "", "/coffees"],
    ["/coffees", "?", "/coffees"],
    ["/coffees", "q=a&sort=new", "/coffees?q=a&sort=new"],
    ["/coffees", "?q=a", "/coffees?q=a"],
  ];
  for (const [path, search, want] of cases) {
    const got = nextWithSearch(path, search);
    assert.equal(got, want);
    assert.equal(parseLocaleForm("en", got).next, want);
  }
});
