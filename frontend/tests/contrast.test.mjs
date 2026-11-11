// Colour token contrast (#229): muted and danger text stay readable. Run with `npm test`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { contrastRatio } from "../lib/contrast.ts";

const root = new URL("..", import.meta.url).pathname;
const css = readFileSync(join(root, "app", "globals.css"), "utf8");

function token(name) {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{3,6})\\s*;`));
  assert.ok(m, `--color-${name} is a hex value in globals.css`);
  return m[1];
}

test("contrastRatio matches known values", () => {
  assert.equal(contrastRatio("#000", "#fff"), 21);
  assert.equal(contrastRatio("#ffffff", "#ffffff"), 1);
});

test("muted and danger are at least 4.5:1 on white, muted also on paper", () => {
  const [ink, muted, faint, danger, paper] = ["ink", "muted", "faint", "danger", "paper"].map(token);
  for (const [name, fg, bg] of [
    ["ink on white", ink, "#ffffff"],
    ["muted on white", muted, "#ffffff"],
    ["muted on paper", muted, paper],
    ["danger on white", danger, "#ffffff"],
  ]) {
    assert.ok(contrastRatio(fg, bg) >= 4.5, `${name}: ${contrastRatio(fg, bg).toFixed(2)}`);
  }
  assert.ok(contrastRatio(faint, "#ffffff") < contrastRatio(muted, "#ffffff"), "faint is lighter than muted");
});
