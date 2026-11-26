// #294: no page scrolls sideways on a phone (390 px wide, an iPhone 12 / 13 / 14). /map once rendered 404 px wide
// because a long shop name stretched a grid column; a shop with a very long unbroken name is created on purpose so
// the cards, the list and the dashboard have to cope with one.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { addCoffee, BASE_URL, launch, loaded, openShop, publish, register, RUN, step } from "./lib.mjs";

const VIEWPORT = { width: 390, height: 844 };

let browser, ctx, page;
const slug = `layout-${RUN}`.toLowerCase();
// One long word with no spaces: the worst case for a card's first line and for the map list.
const shopName = `Gamma${"q1794".repeat(10)}${RUN}`;
let coffeePath;

before(async () => {
  browser = await launch();
  ctx = await browser.newContext({ baseURL: BASE_URL, viewport: VIEWPORT });
  await ctx.addCookies([{ name: "locale", value: "en", url: BASE_URL }]);
  page = await ctx.newPage();
  await step(page, "layout-setup", async () => {
    await register(page, { name: `Layout ${RUN}`, email: `e2e-layout-${RUN}@example.com` });
    await openShop(page, { name: shopName, slug });
    // A Brazil natural (not addCoffee's defaults): nothing like the seeded 耶加雪菲 either (#507).
    const edit = await addCoffee(page, `Layout Natural ${RUN}`, { origin: "Brazil", process: "Natural", notes: "cocoa" });
    await publish(page, `Layout Natural ${RUN}`);
    coffeePath = edit.replace("/dashboard", "");
  });
});
after(() => browser?.close());

// [label, path (or a function returning it), the page is client-rendered (true, or a label its finished view has, #542)]
const pages = [
  ["home", "/"],
  ["coffees", "/coffees"],
  ["coffee page", () => coffeePath],
  ["shops", "/shops"],
  ["shop page", () => `/shops/${slug}`],
  ["map", "/map"],
  ["login", "/login"],
  ["register", "/register"],
  ["account", "/account", true],
  ["dashboard", "/dashboard", true],
  ["shop profile", "/dashboard/shop", true],
  ["new coffee", "/dashboard/coffees/new", "Name *"],
  ["cart", "/cart", true],
];

describe("no horizontal scrolling at 390 px", () => {
  for (const [label, path, client] of pages) {
    it(label, async () => {
      await step(page, `layout-${label}`, async () => {
        await page.goto(typeof path === "function" ? path() : path);
        await page.waitForLoadState("networkidle");
        if (client) await loaded(page, typeof client === "string" ? client : undefined);
        const m = await page.evaluate(() => ({
          client: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
          // The widest elements that stick out past the viewport, to name the culprit in the failure message.
          wide: [...document.querySelectorAll("body *")]
            .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
            .slice(0, 5)
            .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`),
        }));
        assert.ok(
          m.scroll <= m.client,
          `${label}: page is ${m.scroll}px wide in a ${m.client}px viewport; sticking out: ${m.wide.join(" | ")}`,
        );
      });
    });
  }
});
