// Which field a coffee-details problem is shown under (lib/dashboard/coffeeFields.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COFFEE_API_ALIASES,
  COFFEE_ORDER,
  OPTIONAL_ORDER,
  isOptionalField,
  problemField,
  variantField,
} from "../lib/dashboard/coffeeFields.ts";
import { formFieldFor } from "../lib/formErrors.ts";

const ok = { name: "Aricha", originCountryId: "o", processingMethodId: "p", altitudeMin: "1800" };

test("problemField points each problem at its field", () => {
  const cases = [
    ["variety", ok, "variety"],
    ["producer", ok, "producer"],
    ["region", ok, "region"],
    ["notesRequired", ok, "notes"],
    ["notes", ok, "notes"],
    ["harvest", ok, "harvestYear"],
    ["required", { ...ok, name: "  " }, "name"],
    ["required", { ...ok, originCountryId: "" }, "origin"],
    ["required", { ...ok, processingMethodId: "" }, "process"],
    ["altitude", { ...ok, altitudeMin: "" }, "altitudeMin"],
    ["altitude", { ...ok, altitudeMin: "abc" }, "altitudeMin"],
    ["altitude", { ...ok, altitudeMin: "9000" }, "altitudeMin"],
    ["altitude", { ...ok, altitudeMin: "1,800" }, "altitudeMax"],
  ];
  for (const [problem, d, want] of cases) assert.equal(problemField(problem, d), want, `${problem} ${JSON.stringify(d)}`);
});

test("API field names map onto the form's fields", () => {
  const all = [...COFFEE_ORDER, ...OPTIONAL_ORDER];
  const cases = [
    ["flavorNotes", "notes"],
    ["altitudeMinM", "altitudeMin"],
    ["altitudeMaxM", "altitudeMax"],
    ["originCountryId", "origin"],
    ["processingMethodId", "process"],
    ["varietyId", "variety"],
    ["roastLevel", "roast"],
    ["brewMethod", "brew"],
    ["name", "name"],
    ["description", "description"],
    ["producer", "producer"],
    ["harvestYear", "harvestYear"],
    ["clearHarvestYear", "harvestYear"],
    ["variants", undefined],
    ["input", undefined],
  ];
  for (const [api, want] of cases) assert.equal(formFieldFor(api, all, COFFEE_API_ALIASES), want, api);
});

test("optional fields are the ones inside the fold; option-row controls get their own ids", () => {
  assert.equal(isOptionalField("harvestYear"), true);
  assert.equal(isOptionalField("brew"), true);
  assert.equal(isOptionalField("notes"), false);
  assert.equal(variantField(2, "price"), "variant-2-price");
});
