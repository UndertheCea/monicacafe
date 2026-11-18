// createShop conflict mapping (lib/dashboard/createShop.ts, #392). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createShopConflict } from "../lib/dashboard/createShop.ts";

test("createShopConflict", () => {
  const cases = [
    { name: "already owns a shop", code: "CONFLICT", field: "owner", want: "hasShop" },
    { name: "URL name taken", code: "CONFLICT", field: "slug", want: "slugTaken" },
    { name: "unknown conflict is not blamed on the URL", code: "CONFLICT", field: undefined, want: null },
    { name: "not a conflict", code: "BAD_USER_INPUT", field: "slug", want: null },
  ];
  for (const c of cases) assert.equal(createShopConflict(c.code, c.field), c.want, c.name);
});
