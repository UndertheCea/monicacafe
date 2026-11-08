// Shop placeholders (#112): initials instead of ☕. Run with `npm test`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { shopInitials } from "../lib/shopInitials.ts";

const root = new URL("..", import.meta.url).pathname;

test("shopInitials: first character for CJK names, two initials for Latin names", () => {
  const cases = [
    ["晨光烘豆所 Dawn Roastery", "晨"],
    ["山嵐咖啡", "山"],
    ["  府城焙煎所", "府"],
    ["Dawn Roastery", "DR"],
    ["dawn roastery co", "DR"],
    ["Kaffa", "K"],
    ["moni-cafe", "MC"],
    ["☕ Bean & Leaf", "BL"],
    ["Dawn 晨光", "D"],
    ["3 Fourteen", "3F"],
    ["Émile Café", "ÉC"],
    ["コーヒー", "コ"],
    ["", ""],
    ["   ", ""],
    ["☕☕", ""],
  ];
  for (const [name, want] of cases) assert.equal(shopInitials(name), want, JSON.stringify(name));
});

test("no ☕ or emoji placeholders are left in the UI", () => {
  for (const f of [
    "components/shops/ShopCard.tsx",
    "app/shops/[slug]/page.tsx",
    "components/account/FollowedShops.tsx",
    "components/coffees/CoffeeDetailView.tsx",
    "app/not-found.tsx",
    "components/ErrorState.tsx",
  ]) {
    const src = readFileSync(join(root, f), "utf8");
    assert.doesNotMatch(src, /☕/, f);
  }
  for (const f of ["components/shops/ShopCard.tsx", "app/shops/[slug]/page.tsx", "components/account/FollowedShops.tsx", "components/coffees/CoffeeDetailView.tsx"]) {
    assert.match(readFileSync(join(root, f), "utf8"), /<ShopLogo\b/, f);
  }
});
