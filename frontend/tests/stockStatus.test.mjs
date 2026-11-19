// Dashboard restock hints (lib/dashboard/stockStatus.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { LOW_STOCK, stockStatus } from "../lib/dashboard/stockStatus.ts";

const v = (stock, isAvailable = true, priceTwd = 500) => ({ stock, isAvailable, priceTwd });

test("stockStatus", () => {
  const cases = [
    ["no options", [], { kind: "none" }],
    ["all zero", [v(0), v(0)], { kind: "out" }],
    ["stock only on unavailable", [v(9, false), v(0)], { kind: "out" }],
    ["low", [v(2), v(3)], { kind: "low", units: 5 }],
    ["unavailable stock ignored", [v(3), v(50, false)], { kind: "low", units: 3 }],
    ["just above low", [v(LOW_STOCK + 1)], { kind: "ok", units: LOW_STOCK + 1 }],
    ["NT$0 option is not buyable", [v(9, true, 0), v(2)], { kind: "low", units: 2 }],
    ["only NT$0 stock", [v(9, true, 0)], { kind: "out" }],
    ["plenty", [v(10), v(0), v(4)], { kind: "ok", units: 14 }],
  ];
  for (const [name, variants, want] of cases) assert.deepEqual(stockStatus(variants), want, name);
});
