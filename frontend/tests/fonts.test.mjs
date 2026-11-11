// #234: the root layout loads only the wordmark font, and route changes don't animate the scroll.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("only the wordmark face is loaded by next/font", () => {
  const m = layout.match(/import \{([^}]*)\} from "next\/font\/google"/);
  assert.ok(m, "next/font/google import");
  assert.deepEqual(m[1].split(",").map((s) => s.trim()).filter(Boolean), ["Inter_Tight"]);
});

test("smooth scrolling is opt-in for motion and off during navigation", () => {
  assert.match(layout, /<html[^>]*data-scroll-behavior="smooth"/);
  assert.doesNotMatch(css, /@apply scroll-smooth;/);
  assert.match(css, /motion-safe:scroll-smooth/);
});
