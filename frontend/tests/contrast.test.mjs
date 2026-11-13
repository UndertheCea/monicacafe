// Colour token contrast (#229): muted and danger text stay readable. Run with `npm test`.
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
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

test("every text token (ink, muted, danger) is at least 4.5:1 on white and on paper", () => {
  const paper = token("paper");
  for (const name of ["ink", "muted", "danger"]) {
    for (const [bgName, bg] of [["white", "#ffffff"], ["paper", paper]]) {
      const r = contrastRatio(token(name), bg);
      assert.ok(r >= 4.5, `${name} on ${bgName}: ${r.toFixed(2)}`);
    }
  }
  assert.ok(contrastRatio(token("faint"), "#ffffff") < contrastRatio(token("muted"), "#ffffff"), "faint is lighter than muted");
});

test("text-faint is only used for placeholders and decorative marks", () => {
  const files = execSync("grep -rl 'text-faint' app components || true", { cwd: root }).toString().split("\n").filter(Boolean);
  for (const f of files) {
    const src = readFileSync(join(root, f), "utf8");
    for (const line of src.split("\n").filter((l) => l.includes("text-faint"))) {
      assert.ok(/aria-hidden|placeholder:text-faint|>–</.test(line), `${f}: informational text must not be text-faint: ${line.trim()}`);
    }
  }
});
