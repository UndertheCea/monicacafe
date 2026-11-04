import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { boundsOf, groupByCity, locatedPins, type ShopPin } from "./map.ts";

const pin = (id: string, city: string, lat: number | null, lng: number | null): ShopPin => ({
  id,
  slug: id,
  name: id,
  city,
  lat,
  lng,
});

describe("locatedPins", () => {
  const cases: { name: string; in: ShopPin; keep: boolean }[] = [
    { name: "valid Taipei", in: pin("a", "台北市", 25.05, 121.51), keep: true },
    { name: "null lat", in: pin("b", "台北市", null, 121.5), keep: false },
    { name: "null lng", in: pin("c", "台北市", 25.0, null), keep: false },
    { name: "NaN", in: pin("d", "台北市", Number.NaN, 121.5), keep: false },
    { name: "lat out of range", in: pin("e", "台北市", 91, 121.5), keep: false },
    { name: "lng out of range", in: pin("f", "台北市", 25, -181), keep: false },
    { name: "zero is valid", in: pin("g", "", 0, 0), keep: true },
  ];
  for (const tc of cases) {
    it(tc.name, () => {
      assert.equal(locatedPins([tc.in]).length, tc.keep ? 1 : 0);
    });
  }
});

describe("groupByCity", () => {
  it("keeps first-seen city order and puts blank city last", () => {
    const groups = groupByCity([
      pin("1", "台中市", 0, 0),
      pin("2", "", 0, 0),
      pin("3", "台北市", 0, 0),
      pin("4", "台中市 ", 0, 0),
    ]);
    assert.deepEqual(
      groups.map(([city, ps]) => [city, ps.map((p) => p.id)]),
      [
        ["台中市", ["1", "4"]],
        ["台北市", ["3"]],
        ["", ["2"]],
      ],
    );
  });
});

describe("boundsOf", () => {
  it("returns null for no pins", () => {
    assert.equal(boundsOf([]), null);
  });
  it("spans every pin", () => {
    const pins = locatedPins([pin("tp", "", 25.05, 121.51), pin("tn", "", 22.99, 120.2), pin("tc", "", 24.14, 120.66)]);
    assert.deepEqual(boundsOf(pins), [
      [22.99, 120.2],
      [25.05, 121.51],
    ]);
  });
});
