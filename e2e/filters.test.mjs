// /coffees filters (#492): removing a chip is a soft navigation that keeps the page mounted; the sidebar form must
// follow the URL, or the removed filter stays selected and comes back on "Apply".
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { launch, newVisitor, step } from "./lib.mjs";

let browser;
before(async () => {
  browser = await launch();
});
after(() => browser?.close());

describe("/coffees filters", () => {
  it("removing a chip clears the matching sidebar field", async () => {
    const { ctx, page } = await newVisitor(browser);
    try {
      await step(page, "filter-chip", async () => {
        await page.goto("/coffees?sort=price_asc");
        const origin = page.locator('select[name="origin"]');
        const id = await origin.locator("option").nth(1).getAttribute("value");
        assert.ok(id, "the seed has at least one origin with coffees");
        await origin.selectOption(id);
        await page.getByRole("button", { name: "Apply filters" }).click();
        await page.waitForURL((u) => u.searchParams.get("origin") === id);
        await page.getByRole("link", { name: /^Remove filter/ }).first().click();
        await page.waitForURL((u) => !u.searchParams.has("origin"));
        assert.equal(new URL(page.url()).searchParams.get("sort"), "price_asc", "the sort is kept");
        await page.waitForFunction(() => document.querySelector('select[name="origin"]')?.value === "", null, { timeout: 5000 });
        assert.deepEqual(page.errors, []);
      });
    } finally {
      await ctx.close();
    }
  });
});
