// Design system (#230): one Button, one Input, one Card, one heading scale (lib/ui.ts, components/ui/).
// The recipes are checked directly; the scans keep hand-rolled copies out of app/ and components/.
// Run with `npm test`.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import * as ui from "../lib/ui.ts";

const root = new URL("..", import.meta.url).pathname;

function sources(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const SIZES = { md: "min-h-11", sm: "min-h-9" };
// app/ and components/, except the primitives themselves.
const files = [...sources(join(root, "app")), ...sources(join(root, "components"))].filter(
  (p) => !p.includes(`${join("components", "ui")}/`),
);
const rel = (p) => relative(root, p);

function offenders(re) {
  const out = [];
  for (const p of files) {
    readFileSync(p, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (re.test(line)) out.push(`${rel(p)}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
  }
  return out;
}

test("buttonClass: every variant and size is a pill with the right tap height", () => {
  for (const variant of ui.BUTTON_VARIANT_NAMES) {
    for (const size of Object.keys(SIZES)) {
      const cls = ui.buttonClass({ variant, size });
      assert.match(cls, /\brounded-full\b/, `${variant}/${size}`);
      assert.ok(cls.split(" ").includes(SIZES[size]), `${variant}/${size} has ${SIZES[size]}`);
    }
  }
  assert.deepEqual(ui.BUTTON_VARIANT_NAMES.sort(), ["danger", "primary", "quiet", "secondary"]);
});

test("buttonClass: primary is black, full stretches, className is appended", () => {
  assert.match(ui.buttonClass({ variant: "primary" }), /\bbg-ink\b/);
  assert.match(ui.buttonClass(), /\bbg-ink\b/, "primary is the default");
  assert.ok(ui.buttonClass({ full: true }).split(" ").includes("w-full"));
  assert.ok(!ui.buttonClass().split(" ").includes("w-full"));
  assert.ok(ui.buttonClass({ className: "mt-4" }).endsWith(" mt-4"));
});

test("recipes in lib/ui.ts never remove the focus outline or add a focus ring", () => {
  const recipes = [
    ...ui.BUTTON_VARIANT_NAMES.flatMap((v) => ["md", "sm"].map((s) => ui.buttonClass({ variant: v, size: s }))),
    ui.ICON_BUTTON,
    ui.FIELD_CONTROL,
    ui.SEARCH_CONTROL,
    ui.CARD,
    ui.PAGE_TITLE,
    ui.SECTION_TITLE,
    ui.LABEL,
    ui.FIELD_LABEL,
    ...["solid", "outline", "soft", "danger"].map((tone) => ui.badgeClass(tone)),
  ];
  for (const cls of recipes) {
    assert.ok(!cls.includes("outline-none"), cls);
    assert.ok(!cls.includes("focus:ring"), cls);
  }
  assert.ok(!readFileSync(join(root, "lib", "ui.ts"), "utf8").replace(/\/\/.*$/gm, "").includes("outline-none"));
});

test("fieldIds / describedBy: error is read before the hint, nothing when neither", () => {
  assert.deepEqual(ui.fieldIds("x"), { hint: "x-hint", error: "x-error" });
  const cases = [
    [false, false, undefined],
    [true, false, "x-hint"],
    [false, true, "x-error"],
    [true, true, "x-error x-hint"],
  ];
  for (const [hasHint, hasError, want] of cases) {
    assert.equal(ui.describedBy("x", hasHint, hasError), want, `hint=${hasHint} error=${hasError}`);
  }
});

test("no hand-rolled black pill buttons: use <Button> from components/ui", () => {
  const out = [];
  for (const p of files) {
    const text = readFileSync(p, "utf8");
    // Every quoted or template string literal is one candidate class list.
    for (const m of text.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
      const s = m[1] ?? m[2] ?? m[3];
      if (/\brounded-full\b/.test(s) && /\bbg-ink\b/.test(s) && /(^|\s)px-/.test(s)) {
        out.push(`${rel(p)}: hand-rolled button: use <Button> from components/ui: ${s.slice(0, 100)}`);
      }
    }
  }
  assert.deepEqual(out, []);
});

test("no outline-none / focus:ring in app/ or components/ (the global focus outline does it)", () => {
  assert.deepEqual(offenders(/outline-none|focus:ring-/), []);
});

test("one box radius: no rounded-2xl / xl / lg / md / 3xl in app/ or components/", () => {
  assert.deepEqual(offenders(/rounded-(2xl|xl|lg|md|3xl)\b/), []);
});

test("components/dashboard/ui.tsx re-exports the primitives instead of defining its own classes", () => {
  const src = readFileSync(join(root, "components", "dashboard", "ui.tsx"), "utf8");
  assert.ok(!src.includes("rounded-"));
  assert.match(src, /export \{ Button, Card, Field, Input, Select, Textarea \} from "@\/components\/ui"/);
});
