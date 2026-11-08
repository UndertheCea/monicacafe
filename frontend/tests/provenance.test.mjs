// Coffee provenance helpers (lib/provenance.ts) and their JSON-LD. Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAltitude, originLine, provenanceFacts } from "../lib/provenance.ts";
import { coffeeJsonLd } from "../lib/seo.ts";

test("formatAltitude: one height, a range, or nothing", () => {
  const cases = [
    [null, null, null],
    [undefined, undefined, null],
    [null, 2000, null], // a max alone isn't valid data; show nothing
    [1900, null, "1,900 m"],
    [0, null, "0 m"],
    [1800, 2100, "1,800–2,100 m"],
    [2000, 2000, "2,000 m"],
    [950, 1200, "950–1,200 m"],
  ];
  for (const [min, max, want] of cases) assert.equal(formatAltitude(min, max), want, `${min}–${max}`);
});

test("provenanceFacts lists only what is set, in order", () => {
  assert.deepEqual(provenanceFacts({ producer: "", region: "  ", altitudeMinM: null, altitudeMaxM: null }), []);
  assert.deepEqual(
    provenanceFacts({ producer: " 孔加合作社 ", region: "Gedeo", altitudeMinM: 1800, altitudeMaxM: 2100 }),
    [
      ["coffee.producer", "孔加合作社"],
      ["coffee.region", "Gedeo"],
      ["coffee.altitude", "1,800–2,100 m"],
    ],
  );
  assert.deepEqual(provenanceFacts({ producer: "", region: "Huila", altitudeMinM: 1700, altitudeMaxM: null }), [
    ["coffee.region", "Huila"],
    ["coffee.altitude", "1,700 m"],
  ]);
});

test("coffeeJsonLd adds provenance as additionalProperty only when given", () => {
  const coffee = {
    id: "c1",
    name: "Yirgacheffe",
    description: "",
    imageUrls: [],
    shop: { name: "Dawn" },
    variants: [],
  };
  assert.equal(coffeeJsonLd(coffee, "https://moni.cafe").additionalProperty, undefined);
  assert.equal(coffeeJsonLd({ ...coffee, provenance: [] }, "https://moni.cafe").additionalProperty, undefined);
  const ld = coffeeJsonLd(
    {
      ...coffee,
      provenance: provenanceFacts({ producer: "Konga", region: "", altitudeMinM: 1900, altitudeMaxM: null }),
    },
    "https://moni.cafe",
  );
  assert.deepEqual(ld.additionalProperty, [
    { "@type": "PropertyValue", name: "Producer", value: "Konga" },
    { "@type": "PropertyValue", name: "Altitude", value: "1,900 m" },
  ]);
});

test("originLine joins the parts that are set, most specific first", () => {
  const cases = [
    [{}, ""],
    [{ country: "衣索比亞" }, "衣索比亞"],
    [{ producer: "孔加合作社", region: "Gedeo", country: "衣索比亞" }, "孔加合作社 · Gedeo · 衣索比亞"],
    [{ producer: " ", region: "Huila", country: "Colombia" }, "Huila · Colombia"],
    [{ producer: "Finca El Injerto", region: null }, "Finca El Injerto"],
    [{ producer: "Konga", region: "Gedeo" }, "Konga · Gedeo"],
  ];
  for (const [parts, want] of cases) assert.equal(originLine(parts), want, JSON.stringify(parts));
});
