// Draft-preview helpers (lib/dashboard/preview.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { canManageCoffee, previewBannerKey } from "../lib/dashboard/preview.ts";

test("canManageCoffee: only the owning shop or an admin", () => {
  const cases = [
    ["anonymous", null, false],
    ["buyer without shop", { role: "BUYER", shop: null }, false],
    ["owner", { role: "SELLER", shop: { id: "shop-1" } }, true],
    ["other seller", { role: "SELLER", shop: { id: "shop-2" } }, false],
    ["admin without shop", { role: "ADMIN", shop: null }, true],
  ];
  for (const [name, viewer, want] of cases) {
    assert.equal(canManageCoffee("shop-1", viewer), want, name);
  }
});

test("previewBannerKey marks drafts as not public", () => {
  assert.equal(previewBannerKey(false), "preview.draftBanner");
  assert.equal(previewBannerKey(true), "preview.publishedBanner");
});
