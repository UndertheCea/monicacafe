import test from "node:test";
import assert from "node:assert/strict";

import { pluralKey } from "../lib/plural.ts";
import { rateLimitMessage } from "../lib/errors.ts";
import { t } from "../lib/i18n/dict.ts";

test("pluralKey: 1 is singular, everything else plural", () => {
  assert.equal(pluralKey("coffees.comments", 1), "coffees.comments.one");
  for (const n of [0, 2, 11]) assert.equal(pluralKey("coffees.comments", n), "coffees.comments.other");
});

test("English singular and plural forms for every counted message", () => {
  const cases = [
    ["coffees.comments", "1 comment", "3 comments"],
    ["shops.coffeesCount", "1 coffee", "3 coffees"],
    ["dash.variantsCount", "1 option", "3 options"],
    ["map.count", "1 shop on the map", "3 shops on the map"],
    ["map.moreShops", "1 more shop — see all", "3 more shops — see all"],
    ["comments.remaining", "1 character left", "3 characters left"],
    ["error.rateLimitedSec", "Too many requests. Try again in 1 second.", "Too many requests. Try again in 3 seconds."],
    ["error.rateLimitedMin", "Too many requests. Try again in 1 minute.", "Too many requests. Try again in 3 minutes."],
  ];
  for (const [base, one, many] of cases) {
    assert.equal(t("en", pluralKey(base, 1), { n: 1 }), one, base);
    assert.equal(t("en", pluralKey(base, 3), { n: 3 }), many, base);
    assert.equal(t("en", pluralKey(base, 0), { n: 0 }), many.replace("3", "0"), base);
    // zh-TW does not inflect: both forms read the same.
    assert.equal(t("zh-TW", pluralKey(base, 1), { n: 1 }), t("zh-TW", pluralKey(base, 3), { n: 3 }).replace("3", "1"), base);
  }
});

test("rateLimitMessage renders singular and plural English", () => {
  const cases = [
    [undefined, "Too many requests. Try again in 1 minute."],
    [1, "Too many requests. Try again in 1 second."],
    [2, "Too many requests. Try again in 2 seconds."],
    [60, "Too many requests. Try again in 1 minute."],
    [61, "Too many requests. Try again in 2 minutes."],
  ];
  for (const [s, want] of cases) {
    const m = rateLimitMessage(s);
    assert.equal(t("en", m.key, m.vars), want, String(s));
  }
});

test("cardCount: cards print a count only above zero (#552 E, #559)", async () => {
  const { cardCount } = await import("../lib/plural.ts");
  assert.equal(cardCount("en", "coffees.comments", 0), null);
  assert.equal(cardCount("zh-TW", "coffees.comments", 0), null);
  assert.equal(cardCount("en", "coffees.comments", 1), "1 comment");
  assert.equal(cardCount("en", "shops.coffeesCount", 4), "4 coffees");
  assert.equal(cardCount("zh-TW", "coffees.comments", 2), t("zh-TW", "coffees.comments.other", { n: 2 }));
});
