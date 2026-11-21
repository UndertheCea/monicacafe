import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const dir = new URL("../components/dashboard/", import.meta.url);
const read = (f) => readFileSync(new URL(f, dir), "utf8");

test("#452 dashboard first-load failures offer a retry, not a bare notice", () => {
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".tsx"))) {
    assert.ok(!read(f).includes('<Notice>{t(locale, "error.title")}</Notice>'), `${f} shows a bare error notice`);
  }
  for (const f of ["Dashboard", "ShopProfileForm", "CoffeePreview", "VariantManager", "CoffeeDetailsForm", "NewCoffeeForm"]) {
    const s = read(`${f}.tsx`);
    assert.match(s, /<LoadFailed\b/, `${f} uses LoadFailed`);
    assert.match(s, /nextLoadKey/, `${f} uses nextLoadKey`);
  }
});
