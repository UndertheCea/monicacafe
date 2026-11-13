// #264: axe-core on public and signed-in pages. Serious / critical violations fail the job; minor / moderate
// ones are printed. #231 made the public pages clean by hand; this keeps them (and the seller's pages) that way.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, describe, it } from "node:test";
import { addCoffee, launch, loaded, newVisitor, openShop, publish, register, RUN, step } from "./lib.mjs";

const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const FAILING = new Set(["serious", "critical"]);

let browser, v;
const slug = `a11y-${RUN}`.toLowerCase();
const coffeeName = `A11y Washed ${RUN}`;
let editPath;

before(async () => {
  browser = await launch();
  v = await newVisitor(browser, { bypassCSP: true });
  const { page } = v;
  await step(page, "a11y-setup", async () => {
    await register(page, { name: `A11y ${RUN}`, email: `e2e-a11y-${RUN}@example.com` });
    await openShop(page, { name: `A11y Roastery ${RUN}`, slug });
    editPath = await addCoffee(page, coffeeName);
    await publish(page, coffeeName);
  });
});
after(() => browser?.close());

/** Runs axe on the current page; returns the violations, printing the ones that don't fail. */
async function audit(page, label) {
  await page.addScriptTag({ path: AXE });
  const violations = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const r = await axe.run(document, { resultTypes: ["violations"] });
    return r.violations.map((x) => ({
      id: x.id,
      impact: x.impact,
      help: x.help,
      targets: x.nodes.slice(0, 5).map((n) => n.target.join(" ")),
    }));
  });
  for (const x of violations.filter((x) => !FAILING.has(x.impact))) {
    console.log(`# ${label}: ${x.impact} ${x.id} (${x.help}) at ${x.targets.join(", ")}`);
  }
  return violations.filter((x) => FAILING.has(x.impact));
}

function report(label, bad) {
  return bad.map((x) => `${label}: ${x.impact} ${x.id} — ${x.help}\n    at ${x.targets.join("\n       ")}`).join("\n");
}

// [label, path (or a function returning it), wait for this before scanning]
const pages = [
  ["home", "/"],
  ["coffees", "/coffees"],
  ["coffee page", () => editPath.replace("/dashboard", "")],
  ["shops", "/shops"],
  ["shop page", () => `/shops/${slug}`],
  ["map", "/map"],
  ["login", "/login", { signedOut: true }],
  ["register", "/register", { signedOut: true }],
  ["account", "/account", { client: true }],
  ["dashboard", "/dashboard", { client: true }],
  ["shop profile", "/dashboard/shop", { client: true }],
  ["new coffee", "/dashboard/coffees/new"],
  ["edit coffee", () => editPath, { client: true }],
];

describe("axe: no serious or critical violations", () => {
  for (const [label, path, opts = {}] of pages) {
    it(label, async () => {
      // Login / register are scanned as a signed-out visitor would see them.
      const visitor = opts.signedOut ? await newVisitor(browser, { bypassCSP: true }) : v;
      const { page } = visitor;
      try {
        const bad = await step(page, `a11y-${label}`, async () => {
          await page.goto(typeof path === "function" ? path() : path);
          await page.waitForLoadState("networkidle");
          if (opts.client) await loaded(page);
          return audit(page, label);
        });
        assert.equal(bad.length, 0, report(label, bad));
      } finally {
        if (visitor !== v) await visitor.ctx.close();
      }
    });
  }
});
