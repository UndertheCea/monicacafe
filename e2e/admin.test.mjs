// #265: a report reaches /admin and "Take down" removes the comment (moderation, #225).
// Admins are granted only with cmd/admin; the command comes from E2E_GRANT_ADMIN and gets the email appended,
// e.g. E2E_GRANT_ADMIN="docker compose exec -T backend /app/admin grant".
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, before, describe, it } from "node:test";
import { addCoffee, launch, login, newVisitor, openShop, publish, register, RUN, step } from "./lib.mjs";

const GRANT = process.env.E2E_GRANT_ADMIN;
// Locally the check is skipped without a grant command; in CI it must run.
if (!GRANT && process.env.CI) throw new Error("E2E_GRANT_ADMIN is not set");
const seller = { name: `Mod Seller ${RUN}`, email: `e2e-mod-seller-${RUN}@example.com` };
const admin = { name: `Mod Admin ${RUN}`, email: `e2e-mod-admin-${RUN}@example.com` };
const coffeeName = `Mod Natural ${RUN}`;
const badText = `Cheap knock-off beans at another site ${RUN}`;
let browser, coffeeUrl;

before(async () => {
  browser = await launch();
});
after(() => browser?.close());

describe("moderation", { skip: GRANT ? false : "set E2E_GRANT_ADMIN to the cmd/admin grant command" }, () => {
  it("a comment is reported, shows on /admin and is taken down", async () => {
    // The seller lists a coffee and someone (the future admin) leaves a bad comment; the seller reports it.
    const s = await newVisitor(browser);
    const a = await newVisitor(browser);
    await step(s.page, "mod-seller", async () => {
      await register(s.page, seller);
      await openShop(s.page, { name: `Mod Roastery ${RUN}`, slug: `mod-${RUN}`.toLowerCase() });
      coffeeUrl = (await addCoffee(s.page, coffeeName)).replace("/dashboard", "");
      await publish(s.page, coffeeName);
    });
    await step(a.page, "mod-comment", async () => {
      await register(a.page, admin);
      await a.page.goto(coffeeUrl);
      await a.page.getByLabel("Share your thoughts").fill(badText);
      await a.page.getByRole("button", { name: "Post comment" }).click();
      await a.page.getByText(badText).waitFor();
    });
    await step(s.page, "mod-report", async () => {
      await s.page.goto(coffeeUrl);
      const comment = s.page.getByRole("listitem").filter({ hasText: badText }).last();
      await comment.getByRole("button", { name: "Report" }).click();
      const dialog = s.page.getByRole("dialog", { name: "Report comment" });
      await dialog.getByLabel("Spam or advertising").check();
      await dialog.getByRole("button", { name: "Send report" }).click();
      await dialog.getByText("Thanks. An admin will look at it soon.").waitFor();
    });
    await step(s.page, "mod-not-admin", async () => {
      await s.page.goto("/admin");
      await s.page.getByText("This page is for admins only.").waitFor();
      assert.equal(await s.page.getByText(badText).count(), 0, "a non-admin sees no reports");
    });

    execFileSync("sh", ["-c", `${GRANT} "$1"`, "grant", admin.email], { stdio: "inherit" });

    const fresh = await newVisitor(browser); // a new session, so the token carries the role
    await step(fresh.page, "mod-admin", async () => {
      await login(fresh.page, admin.email);
      await fresh.page.goto("/admin");
      const row = fresh.page.getByRole("row").filter({ hasText: badText });
      await row.getByRole("button", { name: "Take down" }).click();
      await fresh.page.getByLabel("Reason (required)").fill("Advertising another shop (e2e)");
      await fresh.page.getByRole("button", { name: "Confirm" }).click();
      await row.waitFor({ state: "detached" });
      await fresh.page.reload();
      await fresh.page.getByRole("heading", { name: "Open reports" }).waitFor();
      await fresh.page.waitForLoadState("networkidle");
      assert.equal(await fresh.page.getByRole("row").filter({ hasText: badText }).count(), 0, "the report is closed");
    });
    await step(s.page, "mod-gone", async () => {
      await s.page.goto(coffeeUrl);
      await s.page.getByRole("heading", { level: 1, name: coffeeName }).waitFor();
      assert.equal(await s.page.getByText(badText).count(), 0, "the comment is gone from the coffee page");
    });
    for (const v of [s, a, fresh]) await v.ctx.close();
  });
});
