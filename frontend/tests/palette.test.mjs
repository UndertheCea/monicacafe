// Visual direction (#109): white page, black type, no amber / yellow accents and no gradients.
// The only colour is the Radix tile behind a coffee without a photo (lib/coffeeTile.ts), which
// sets its colour through an inline style, so no colour utility class belongs in app/ or components/.
// Run with `npm test`.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const root = new URL("..", import.meta.url).pathname;

function sources(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.(tsx?|css)$/.test(p)) out.push(p);
  }
  return out;
}

const files = [...sources(join(root, "app")), ...sources(join(root, "components"))];

// Every Tailwind hue except neutral (greys) and red (errors mean something). Black / white / ink / paper are fine.
const BANNED = /\b(?:[a-z-]+:)*(?:bg|text|ring|border|from|via|to|accent|fill|stroke|outline|decoration|shadow)-(?:amber|yellow|orange|lime|stone|emerald|green|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc)-\d{2,3}\b|gradient/;

test("no colour utilities (only neutral, black, white and error red) and no gradients in app/ or components/", () => {
  const offenders = [];
  for (const p of files) {
    readFileSync(p, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (BANNED.test(line)) offenders.push(`${relative(root, p)}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
  }
  assert.deepEqual(offenders, []);
});

test("palette tokens live in globals.css and the page is white with black type", () => {
  const css = readFileSync(join(root, "app", "globals.css"), "utf8");
  for (const token of ["--color-ink", "--color-paper", "--color-muted", "--color-line"]) {
    assert.match(css, new RegExp(`${token}:`), token);
  }
  assert.match(css, /--color-paper: #fff(?:fff)?;/i);
  assert.match(css, /@apply bg-paper text-ink/);
});

test("the home hero is not a dark block", () => {
  const home = readFileSync(join(root, "app", "page.tsx"), "utf8");
  assert.doesNotMatch(home, /bg-(?:ink|black|neutral-[89]00)\b[^"]*py-24/);
});
