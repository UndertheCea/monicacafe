// #263: the main Stage 1 journeys in a real browser, through nginx, on every PR.
// Steps share state (the seller's coffee is what the buyer saves), so they run in order.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { addCoffee, launch, loaded, makePng, newVisitor, openShop, publish, register, RUN, step } from "./lib.mjs";

const seller = { name: `E2E Seller ${RUN}`, email: `e2e-seller-${RUN}@example.com` };
const buyer = { name: `E2E Buyer ${RUN}`, email: `e2e-buyer-${RUN}@example.com` };
const shopName = `E2E Roastery ${RUN}`;
const slug = `e2e-${RUN}`.toLowerCase();
const coffeeName = `E2E Yirgacheffe ${RUN}`;

let browser, s, b; // s / b: the seller's and the buyer's { ctx, page }
let coffeeUrl; // public /coffees/<id>
let editUrl; // /dashboard/coffees/<id>

before(async () => {
  browser = await launch();
  s = await newVisitor(browser);
  b = await newVisitor(browser);
});
after(async () => {
  for (const v of [s, b]) assert.deepEqual(v?.page.errors ?? [], [], "uncaught page errors");
  await browser?.close();
});

describe("seller", () => {
  it("registers and opens a shop", async () => {
    const { page } = s;
    await step(page, "seller-register", () => register(page, seller));
    await step(page, "open-shop", () => openShop(page, { name: shopName, slug }));
  });

  it("adds a coffee with every required field and one option", async () => {
    const { page } = s;
    await step(page, "new-coffee", async () => {
      editUrl = await addCoffee(page, coffeeName);
      assert.match(editUrl, /^\/dashboard\/coffees\/[0-9a-f-]{36}$/);
      coffeeUrl = editUrl.replace("/dashboard", "");
    });
  });

  it("uploads a photo: the original and its thumbnail reach /media/", async () => {
    const { page } = s;
    await step(page, "upload-photo", async () => {
      await page.goto(editUrl);
      await loaded(page);
      const puts = [];
      page.on("response", (r) => {
        if (r.request().method() === "PUT" && new URL(r.url()).pathname.startsWith("/media/")) puts.push(r);
      });
      const png = await makePng(page);
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "+ Add photo" }).click();
      await (await chooser).setFiles({ name: "e2e.png", mimeType: "image/png", buffer: png });
      // The saved photo shows in the editor, served from the bucket.
      const img = page.locator('img[src*="/media/"]').first();
      await img.waitFor();
      assert.equal(puts.length, 2, `two PUTs (original + thumbnail), got ${puts.map((r) => r.url()).join(", ")}`);
      for (const r of puts) assert.ok(r.ok(), `PUT ${r.url()} → ${r.status()}`);
      assert.ok(puts.some((r) => new URL(r.url()).pathname.endsWith(".thumb.webp")), "one PUT is the .thumb.webp");
      // Both files can be read back through nginx.
      for (const r of puts) {
        const res = await page.request.get(new URL(r.url()).pathname);
        assert.equal(res.status(), 200, `GET ${new URL(r.url()).pathname}`);
      }
    });
  });

  it("publishes the coffee; it is listed on /coffees with its photo", async () => {
    const { page } = s;
    await step(page, "publish", () => publish(page, coffeeName));
    await step(page, "listed", async () => {
      await page.goto(`/coffees?q=${encodeURIComponent(coffeeName)}`);
      const card = page.locator("article").filter({ hasText: coffeeName });
      await card.waitFor();
      await page.goto(coffeeUrl);
      await page.getByRole("heading", { level: 1, name: coffeeName }).waitFor();
      const photo = page.locator('main img[src*="/media/"]').first();
      await photo.waitFor();
      await photo.scrollIntoViewIfNeeded();
      assert.ok(await photo.evaluate((el) => el.complete && el.naturalWidth > 0), "the photo loads");
    });
  });
});

describe("buyer", () => {
  it("registers, saves the coffee and follows the shop; both survive a reload", async () => {
    const { page } = b;
    await step(page, "buyer-register", () => register(page, buyer));
    await step(page, "save", async () => {
      await page.goto(coffeeUrl);
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByRole("button", { name: "Saved" }).waitFor();
      await page.getByText("Saved by 1").waitFor();
      await page.reload();
      await page.getByRole("button", { name: "Saved" }).waitFor();
    });
    await step(page, "follow", async () => {
      await page.goto(`/shops/${slug}`);
      await page.getByRole("button", { name: "Follow", exact: true }).click();
      await page.getByRole("button", { name: "Following" }).waitFor();
      await page.getByText("Followed by 1").waitFor();
      await page.reload();
      await page.getByRole("button", { name: "Following" }).waitFor();
    });
    await step(page, "account-lists", async () => {
      await page.goto("/account");
      await page.getByRole("link", { name: coffeeName }).first().waitFor();
      await page.getByRole("link", { name: shopName }).first().waitFor();
    });
  });

  it("comments; only the seller's reply carries the Roaster badge", async () => {
    const buyerText = `Bright and floral ${RUN}`;
    const sellerText = `Thanks for trying it ${RUN}`;
    await step(b.page, "buyer-comment", async () => {
      await b.page.goto(coffeeUrl);
      await b.page.getByLabel("Share your thoughts").fill(buyerText);
      await b.page.getByRole("button", { name: "Post comment" }).click();
      await b.page.getByText(buyerText).waitFor();
    });
    await step(s.page, "seller-comment", async () => {
      await s.page.goto(coffeeUrl);
      await s.page.getByText(buyerText).waitFor();
      await s.page.getByLabel("Share your thoughts").fill(sellerText);
      await s.page.getByRole("button", { name: "Post comment" }).click();
      await s.page.getByText(sellerText).waitFor();
    });
    await step(b.page, "badges", async () => {
      await b.page.reload();
      const item = (text) => b.page.getByRole("listitem").filter({ hasText: text }).last();
      await item(sellerText).getByText("Roaster", { exact: true }).waitFor();
      assert.equal(await item(buyerText).getByText("Roaster", { exact: true }).count(), 0);
    });
  });
});

describe("without JavaScript", () => {
  it("/coffees and a coffee page render their content", async () => {
    const v = await newVisitor(browser, { javaScript: false });
    try {
      await step(v.page, "nojs-list", async () => {
        await v.page.goto(`/coffees?q=${encodeURIComponent(coffeeName)}`);
        assert.ok(await v.page.locator("article").filter({ hasText: coffeeName }).count(), "the card is in the HTML");
      });
      await step(v.page, "nojs-coffee", async () => {
        await v.page.goto(coffeeUrl);
        await v.page.getByRole("heading", { level: 1, name: coffeeName }).waitFor();
        await v.page.getByText("NT$480").first().waitFor();
        await v.page.getByText("Bright and floral").first().waitFor();
      });
    } finally {
      await v.ctx.close();
    }
  });
});
