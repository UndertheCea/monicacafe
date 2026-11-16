// Listing count keys (#324, lib/plural.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { t } from "../lib/i18n/dict.ts";
import { pluralKey } from "../lib/plural.ts";

test("pluralKey listing counts: one result is singular in English, zh-TW unchanged", () => {
  assert.equal(t("en", pluralKey("coffees.count", 1), { n: 1 }), "1 coffee");
  assert.equal(t("en", pluralKey("coffees.count", 0), { n: 0 }), "0 coffees");
  assert.equal(t("en", pluralKey("coffees.count", 12), { n: 12 }), "12 coffees");
  assert.equal(t("en", pluralKey("shops.count", 1), { n: 1 }), "1 shop");
  assert.equal(t("en", pluralKey("shops.count", 2), { n: 2 }), "2 shops");
  assert.equal(t("zh-TW", pluralKey("coffees.count", 1), { n: 1 }), "共 1 款咖啡");
  assert.equal(t("zh-TW", pluralKey("shops.count", 3), { n: 3 }), "共 3 間店家");
});
