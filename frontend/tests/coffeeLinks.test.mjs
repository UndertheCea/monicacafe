// Every link to /coffees?<param>= in the source must use a param parseCoffeeSearch reads (#227). Run with `npm test`.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "..");

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

// coffeeFilters.ts has extensionless imports Node can't load, so read the COFFEE_PARAM map from its source.
const filtersSrc = readFileSync(join(root, "lib/coffeeFilters.ts"), "utf8");
const block = filtersSrc.match(/export const COFFEE_PARAM = \{([^}]*)\}/)?.[1] ?? "";
const known = new Set([...block.matchAll(/:\s*"([a-z]+)"/g)].map((m) => m[1]));

/** Param names used by `/coffees?a=…&b=…` strings in `src` (skips `/coffees?${qs}`, built by a helper). */
function linkedParams(src) {
  const names = [];
  for (const m of src.matchAll(/\/coffees\?([^"'`\s]*)/g)) {
    for (const pair of m[1].split("&")) {
      const name = pair.split("=")[0];
      if (name && !name.startsWith("$")) names.push(name);
    }
  }
  return names;
}

test("the param map is read from COFFEE_PARAM and parseCoffeeSearch only reads through it", () => {
  assert.deepEqual([...known].sort(), ["instock", "max", "min", "origin", "page", "process", "q", "sort", "variety"]);
  assert.ok(!/\bsp\.\w+/.test(filtersSrc), "parseCoffeeSearch reads a param by name instead of COFFEE_PARAM");
});

test("linkedParams finds the old ?flavor link and ignores helper-built ones", () => {
  assert.deepEqual(linkedParams("href={`/coffees?flavor=${x}&q=1`}"), ["flavor", "q"]);
  assert.deepEqual(linkedParams("`/coffees?${qs}`"), []);
});

test("no source links to a /coffees param the page ignores", () => {
  const bad = [];
  for (const dir of ["app", "components", "lib"]) {
    for (const file of walk(join(root, dir))) {
      for (const name of linkedParams(readFileSync(file, "utf8"))) {
        if (!known.has(name)) bad.push(`${file}: ?${name}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});
