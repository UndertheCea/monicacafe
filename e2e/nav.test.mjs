// The navigation drawer (#175, #185, #331): named for screen readers but with no visible heading, Home first, the
// language switch labelled, Esc closes it and focus goes back to the menu button. /menu (no JavaScript) has the same.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { launch, newVisitor, step } from "./lib.mjs";

let browser;
before(async () => {
  browser = await launch();
});
after(() => browser?.close());

describe("navigation drawer", () => {
  it("opens from the keyboard, starts with Home, labels the language switch and closes on Esc", async () => {
    const { ctx, page } = await newVisitor(browser);
    try {
      await step(page, "nav-drawer", async () => {
        await page.goto("/coffees");
        const button = page.getByRole("button", { name: "Open menu" });
        await button.focus();
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog", { name: "Site menu" });
        await dialog.waitFor();
        // The heading names the dialog but isn't shown (#331).
        const heading = dialog.getByRole("heading", { name: "Site menu" });
        assert.equal(await heading.evaluate((h) => h.getBoundingClientRect().width <= 1), true, "heading is sr-only");
        assert.equal(await dialog.getByRole("navigation", { name: "Site menu" }).count(), 1);
        const first = dialog.getByRole("link").first();
        assert.equal(await first.textContent(), "Home");
        assert.equal(await first.getAttribute("href"), "/");
        const lang = dialog.getByRole("group", { name: "Language" });
        assert.equal(await lang.getByRole("button", { name: "中文 (switch language)" }).count(), 1);
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        assert.equal(await button.evaluate((b) => b === document.activeElement), true, "focus back on the menu button");
        await button.click();
        await dialog.getByRole("link", { name: "Home" }).click();
        await page.waitForURL((u) => u.pathname === "/");
        await dialog.waitFor({ state: "hidden" });
      });
      assert.deepEqual(page.errors, []);
    } finally {
      await ctx.close();
    }
  });

  it("/menu without JavaScript has Home first and the language label", async () => {
    const { ctx, page } = await newVisitor(browser, { javaScript: false });
    try {
      await step(page, "nav-menu-nojs", async () => {
        await page.goto("/coffees");
        await page.getByRole("link", { name: "Open menu" }).click();
        await page.waitForURL((u) => u.pathname === "/menu");
        const nav = page.getByRole("navigation", { name: "Site menu" });
        assert.equal(await nav.getByRole("link").first().textContent(), "Home");
        assert.equal(await nav.getByRole("group", { name: "Language" }).count(), 1);
        assert.equal(await page.getByRole("heading", { level: 1, name: "Site menu" }).count(), 1);
      });
      // The switch is a plain form post (#367): the page comes back in Chinese.
      await step(page, "nav-menu-nojs-language", async () => {
        await page.getByRole("button", { name: "中文 (switch language)" }).click();
        await page.waitForURL((u) => u.pathname === "/menu");
        assert.equal(await page.locator("html").getAttribute("lang"), "zh-TW");
        assert.equal(await page.getByRole("button", { name: "English（切換語言）" }).count(), 1);
      });
    } finally {
      await ctx.close();
    }
  });
});
