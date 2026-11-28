// #263: the main Stage 1 journeys in a real browser, through nginx, on every PR.
// Steps share state (the seller's coffee is what the buyer saves), so they run in order.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { addCoffee, gotoUntilShown, launch, loaded, makePng, newVisitor, openShop, publish, register, RUN, step } from "./lib.mjs";

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
// The browser closes even when the check fails: an open Chromium keeps the run alive until CI's timeout (#541).
after(async () => {
  try {
    for (const v of [s, b]) assert.deepEqual(v?.page.errors ?? [], [], "uncaught page errors");
  } finally {
    await browser?.close();
  }
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
      // Just published: logged and loaded again if the first render lacks it (#506).
      await gotoUntilShown(page, `/coffees?q=${encodeURIComponent(coffeeName)}`, coffeeName);
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
      // A shop without a pin offers no Google Maps link (#564).
      assert.equal(await page.getByRole("link", { name: /Open in Google Maps/ }).count(), 0, "no map link without a pin");
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
    await step(page, "account-confirm-focus", async () => {
      // #389: the confirm rows move focus to "Yes" and back to the trigger, never to <body>.
      await page.goto("/account");
      const focused = () => page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
      await page.getByRole("button", { name: "Sign out of all devices" }).click();
      await page.getByRole("button", { name: "Yes, sign out everywhere" }).waitFor();
      assert.equal(await focused(), "Yes, sign out everywhere");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Sign out of all devices" }).waitFor();
      assert.equal(await focused(), "Sign out of all devices");
      await page.getByLabel("Enter your password to confirm").fill("not-the-password");
      await page.getByRole("button", { name: "Delete my account" }).click();
      await page.getByRole("button", { name: "Yes, delete it" }).waitFor();
      assert.equal(await focused(), "Yes, delete it");
      await page.getByRole("group", { name: /delete/i }).getByRole("button", { name: "Cancel" }).click();
      await page.getByRole("button", { name: "Delete my account" }).waitFor();
      assert.equal(await focused(), "Delete my account");
    });
    await step(page, "busy-buttons-keep-focus", async () => {
      // #510: a busy button is aria-disabled, not disabled, so keyboard focus stays on it; the last "load more"
      // hands focus to the first row it added. One saved coffee is cloned into 13 so there is a second page,
      // and that page is held back so the busy state can be read.
      const real = [];
      let saved; // the buyer's one saved coffee, from the first page (the real second page is empty)
      let release;
      const held = new Promise((r) => (release = r));
      await page.route("**/graphql", async (route) => {
        const body = route.request().postData() ?? "";
        if (!body.includes("MySavedCoffees")) return route.fallback();
        const res = await route.fetch();
        const json = await res.json();
        saved ??= json.data.me.savedCoffees.nodes[0];
        const node = saved;
        const clone = (i) => ({ ...node, id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}` });
        const offset = JSON.parse(body).variables.offset;
        if (offset > 0) await held;
        const nodes = offset === 0 ? [node, ...Array.from({ length: 11 }, (_, i) => clone(i + 1))] : [clone(12)];
        real.push(offset);
        json.data.me.savedCoffees = { total: 13, nodes };
        await route.fulfill({ response: res, json });
      });
      try {
        await page.goto("/account");
        const more = page.getByRole("button", { name: "Load more saved coffees" });
        await more.focus();
        await page.keyboard.press("Enter");
        const busy = page.locator('button[aria-busy="true"]').filter({ hasText: "Loading" });
        await busy.waitFor();
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-busy")), "true", "focus stays on the busy button");
        release();
        await busy.waitFor({ state: "detached" });
        await page.waitForFunction(
          () => document.activeElement?.getAttribute("data-row") === "00000000-0000-4000-8000-000000000012",
          null,
          { timeout: 5000 },
        );
        assert.deepEqual(real, [0, 12]);
      } finally {
        await page.unroute("**/graphql");
      }
      // A busy Save keeps focus too: pressing it from the keyboard, focus is still there once it's saved.
      await page.goto("/account");
      const save = page.getByRole("button", { name: "Save", exact: true }).first();
      await save.focus();
      await page.keyboard.press("Enter");
      await page.getByRole("status").filter({ hasText: /^Saved$/ }).first().waitFor();
      assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Save", "focus stays on Save");
    });
    await step(page, "download-my-data", async () => {
      await page.goto("/account");
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Download data" }).click(),
      ]);
      assert.match(download.suggestedFilename(), /^monicafe-data-\d{4}-\d{2}-\d{2}\.json$/);
      const raw = readFileSync(await download.path(), "utf8");
      const doc = JSON.parse(raw);
      assert.equal(doc.account.email, buyer.email);
      assert.deepEqual(doc.savedCoffees.map((c) => c.coffeeName), [coffeeName]);
      assert.deepEqual(doc.followedShops.map((f) => f.shopName), [shopName]);
      assert.ok(!/password|token|hash/i.test(raw), "no secrets in the export");
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
      // The seller's tab is already on coffeeUrl; a first load without the buyer's
      // comment once timed out here (#504), so it is logged and reloaded.
      await gotoUntilShown(s.page, coffeeUrl, buyerText);
      await s.page.getByText(buyerText).waitFor();
      await s.page.getByLabel("Share your thoughts").fill(sellerText);
      await s.page.getByRole("button", { name: "Post comment" }).click();
      await s.page.getByText(sellerText).waitFor();
    });
    await step(b.page, "badges", async () => {
      // Same stale first load as #504: the buyer's reload once lacked the seller's reply (#557's CI run).
      await gotoUntilShown(b.page, coffeeUrl, sellerText);
      const item = (text) => b.page.getByRole("listitem").filter({ hasText: text }).last();
      await item(sellerText).getByText("Roaster", { exact: true }).waitFor();
      assert.equal(await item(buyerText).getByText("Roaster", { exact: true }).count(), 0);
    });
    await step(b.page, "comment-edit-focus", async () => {
      // #508: Save and Cancel unmount the editor; focus goes back to "Edit", a save is announced.
      // Focus moves in an effect after the re-render, so wait for it rather than read it once.
      const focusOn = (text) =>
        b.page.waitForFunction((want) => document.activeElement?.textContent?.trim() === want, text, { timeout: 5000 });
      const mine = b.page.getByRole("listitem").filter({ hasText: buyerText }).last();
      await mine.getByRole("button", { name: "Edit" }).click();
      await mine.getByRole("button", { name: "Cancel" }).click();
      await focusOn("Edit");
      await mine.getByRole("button", { name: "Edit" }).click();
      await b.page.keyboard.press("End");
      await b.page.keyboard.type(" (edited)");
      await mine.getByRole("button", { name: "Save" }).click();
      await mine.getByText("Your comment was updated").waitFor({ state: "attached" });
      await focusOn("Edit");
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
      await step(v.page, "nojs-signin-link", async () => {
        // Auth never resolves without JS, so the sign-in link must be in the HTML (#372).
        const link = v.page.getByRole("link", { name: "Log in to add to cart" });
        await link.waitFor();
        assert.match(await link.getAttribute("href"), /^\/login\?next=/);
      });
      await step(v.page, "nojs-comment-signin-link", async () => {
        // The comment form, Save and Follow also show their sign-in links while auth is "loading" (#424).
        const link = v.page.locator("main").getByRole("link", { name: "Log in", exact: true }).first();
        await link.waitFor();
        assert.match(await link.getAttribute("href"), /^\/login\?next=/);
        await v.page.getByRole("link", { name: "Log in to save" }).waitFor();
      });
      await step(v.page, "nojs-shop-map-link", async () => {
        // Last: it leaves the coffee page the steps above read. The seed shop has a pin: the Google Maps link and JSON-LD hasMap are in the HTML (#293, #564, #567).
        await v.page.goto("/shops/demo-roastery");
        const link = v.page.getByRole("link", { name: /^Open in Google Maps/ });
        await link.waitFor();
        assert.equal(await link.getAttribute("href"), "https://www.google.com/maps/search/?api=1&query=25.0553%2C121.5103");
        assert.equal(await link.getAttribute("target"), "_blank");
        assert.match(await link.getAttribute("rel"), /noopener/);
        const ld = await v.page.locator('script[type="application/ld+json"]').allTextContents();
        const store = ld.map((j) => JSON.parse(j)).find((d) => d["@type"] === "Store");
        assert.equal(store?.hasMap, "https://www.google.com/maps/search/?api=1&query=25.0553%2C121.5103", "Store JSON-LD has hasMap");
      });
      await step(v.page, "nojs-cart-needs-js", async () => {
        // Signed-in-only pages never leave "Loading…" without JS, so they say so (#570).
        await v.page.goto("/cart");
        await v.page.getByText("This page needs JavaScript").waitFor();
      });
    } finally {
      await v.ctx.close();
    }
  });
});
