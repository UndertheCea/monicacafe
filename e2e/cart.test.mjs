// #311: the cart in a real browser. A signed-out visitor's choice survives the login round trip; the buyer then adds
// the seeded coffee, sees the header count follow, changes the quantity on /cart and removes the line.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { launch, newVisitor, PASSWORD, register, RUN, SEEDED_COFFEE_PATH, step } from "./lib.mjs";

const buyer = { name: `E2E Cart ${RUN}`, email: `e2e-cart-${RUN}@example.com` };
let browser, b;

before(async () => {
  browser = await launch();
  b = await newVisitor(browser);
});
after(async () => {
  assert.deepEqual(b?.page.errors ?? [], [], "uncaught page errors");
  await browser?.close();
});

/** The header's cart link, named "Cart, 1 bag" / "Cart, N bags" (#322). */
const headerCart = (page, n) => page.getByRole("banner").getByRole("link", { name: `Cart, ${n} ${n === 1 ? "bag" : "bags"}`, exact: true });

describe("cart", () => {
  it("signed-out visitors see no cart link, and their choice survives login", async () => {
    const { page } = b;
    // Create the account, then come back signed out (a fresh visitor with the same account).
    await step(page, "cart-register", () => register(page, buyer));
    await b.ctx.clearCookies();
    await b.ctx.addCookies([{ name: "locale", value: "en", url: page.url() }]);
    await step(page, "cart-signed-out", async () => {
      await page.goto(SEEDED_COFFEE_PATH);
      await page.getByRole("link", { name: "Log in to add to cart" }).waitFor();
      assert.equal(await page.getByRole("banner").getByRole("link", { name: /^Cart, / }).count(), 0);
      const option = await page.getByRole("combobox", { name: /^Option/ }).inputValue();
      await page.getByLabel("Quantity").selectOption("3");
      await page.getByRole("link", { name: "Log in to add to cart" }).click();
      await page.waitForURL((u) => u.pathname === "/login");
      assert.equal(new URL(page.url()).searchParams.get("next"), `${SEEDED_COFFEE_PATH}?option=${option}&qty=3`);
      await page.getByLabel("Email").fill(buyer.email);
      await page.getByLabel("Password").fill(PASSWORD);
      await page.getByRole("button", { name: "Log in" }).click();
      await page.waitForURL((u) => u.pathname === SEEDED_COFFEE_PATH);
      await page.getByRole("button", { name: "Add to cart" }).waitFor();
      await page.waitForFunction(() => !location.search);
      assert.equal(await page.getByLabel("Quantity").inputValue(), "3");
      assert.equal(await page.getByRole("combobox", { name: /^Option/ }).inputValue(), option);
    });
  });

  it("adds, changes the quantity and removes; the header count follows", async () => {
    const { page } = b;
    await step(page, "cart-add", async () => {
      await page.goto(SEEDED_COFFEE_PATH);
      await page.getByText("Add to your cart now; checkout opens soon").waitFor();
      await page.getByLabel("Quantity").selectOption("2");
      await page.getByRole("button", { name: "Add to cart" }).click();
      await page.getByText("Added to your cart.").waitFor();
      await headerCart(page, 2).waitFor();
      // The picker now offers what is left: 20 in stock minus 2 in the cart.
      assert.equal(await page.getByLabel("Quantity").locator("option").count(), 18);
    });
    await step(page, "cart-change", async () => {
      await page.goto("/cart");
      await page.getByText("NT$900").first().waitFor();
      await page.getByLabel("Quantity").selectOption("5");
      await page.getByText("NT$2,250").first().waitFor();
      await headerCart(page, 5).waitFor();
    });
    await step(page, "cart-remove", async () => {
      await page.getByRole("button", { name: "Remove" }).click();
      await page.getByText("Your cart is empty.").waitFor();
      await headerCart(page, 0).waitFor();
    });
  });
});
