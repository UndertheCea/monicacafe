import assert from "node:assert/strict";
import { test } from "node:test";
import { partitionPins } from "../lib/mapPins.ts";

const pin = (id, lat, lng) => ({ id, slug: id, name: id, city: "台北市", lat, lng });

test("partitionPins", async (t) => {
  const cases = [
    { name: "empty", pins: [], placed: [], unplaced: [] },
    { name: "valid Taiwan coordinates", pins: [pin("a", 25.0553, 121.5103)], placed: ["a"], unplaced: [] },
    { name: "zero is a valid coordinate", pins: [pin("z", 0, 0)], placed: ["z"], unplaced: [] },
    { name: "missing lat", pins: [pin("b", null, 121.5)], placed: [], unplaced: ["b"] },
    { name: "missing lng", pins: [pin("c", 25, null)], placed: [], unplaced: ["c"] },
    { name: "lat out of range", pins: [pin("d", 91, 121)], placed: [], unplaced: ["d"] },
    { name: "lng out of range", pins: [pin("e", 25, -181)], placed: [], unplaced: ["e"] },
    { name: "NaN", pins: [pin("f", Number.NaN, 121)], placed: [], unplaced: ["f"] },
    {
      name: "mixed keeps order",
      pins: [pin("1", 24.1, 120.6), pin("2", null, null), pin("3", 22.9, 120.2)],
      placed: ["1", "3"],
      unplaced: ["2"],
    },
  ];
  for (const c of cases) {
    await t.test(c.name, () => {
      const got = partitionPins(c.pins);
      assert.deepEqual(got.placed.map((p) => p.id), c.placed);
      assert.deepEqual(got.unplaced.map((p) => p.id), c.unplaced);
    });
  }
});
