// Shared helpers for the browser checks (#263, #264). Run against a live stack:
//   cd e2e && npm ci && BASE_URL=http://localhost npm test
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

export const BASE_URL = process.env.BASE_URL ?? "http://localhost";
export const ARTIFACTS = new URL("./artifacts/", import.meta.url);
export const PASSWORD = "e2e correct horse battery";

/** A unique suffix per run, so reruns against the same database don't collide. */
export const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

export async function launch() {
  return chromium.launch();
}

/** A fresh browser context in English (the `locale` cookie), like a new visitor. */
// bypassCSP lets the accessibility check inject axe-core next to the nonce'd scripts.
export async function newVisitor(browser, { javaScript = true, bypassCSP = false } = {}) {
  const ctx = await browser.newContext({ baseURL: BASE_URL, javaScriptEnabled: javaScript, bypassCSP });
  await ctx.addCookies([{ name: "locale", value: "en", url: BASE_URL }]);
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  return { ctx, page };
}

/** Saves a full-page screenshot under e2e/artifacts/ (uploaded by CI on failure). */
export async function snap(page, name) {
  await mkdir(ARTIFACTS, { recursive: true });
  const file = fileURLToPath(new URL(`${name.replace(/[^a-z0-9-]+/gi, "-")}.png`, ARTIFACTS));
  await page.screenshot({ path: file, fullPage: true }).catch((e) => console.log(`# screenshot failed: ${e.message}`));
  return file;
}

/** Runs one step; on failure saves a screenshot named after it and rethrows. */
export async function step(page, name, fn) {
  try {
    return await fn();
  } catch (e) {
    const shot = await snap(page, `fail-${name}`);
    e.message += `\n  (screenshot: ${shot}; url: ${page.url()})`;
    throw e;
  }
}

/**
 * Loads `url` until its server-rendered HTML contains `text` (#504). A load that
 * lacks it is logged with what came back (status, size, an error page or not,
 * the time to look up in the stack logs) and a screenshot, then retried, at most
 * `tries` loads in all. The caller still waits for the text on the page, so a
 * page that never shows it fails.
 */
export async function gotoUntilShown(page, url, text, { tries = 3 } = {}) {
  for (let i = 1; ; i++) {
    const res = await page.goto(url);
    const html = (await res?.text().catch(() => "")) ?? "";
    if (html.includes(text) || i >= tries) return res;
    const shot = await snap(page, `stale-${i}-${new URL(url, BASE_URL).pathname}`);
    console.log(
      `# ${url} load ${i}/${tries} lacked ${JSON.stringify(text)}: status ${res?.status()}, ` +
        `${html.length} bytes, error page ${/Couldn't load data|Too many requests|Can't reach the server/.test(html)}, at ${new Date().toISOString()} (screenshot: ${shot})`,
    );
    await page.waitForTimeout(500 * i);
  }
}

/**
 * Registers through the UI and waits until the session is live. A refusal for
 * too many sign-ups from this address fails at once with that reason, not as a
 * bare navigation timeout (#505).
 */
export async function register(page, who) {
  await page.goto("/register");
  await page.getByLabel("Display name").fill(who.name);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign up" }).click();
  const limited = page.getByText(/^Too many requests/).first();
  const outcome = await Promise.race([
    page.waitForURL((u) => !u.pathname.startsWith("/register")).then(() => "registered"),
    limited.waitFor().then(() => "limited"),
  ]);
  if (outcome === "limited") {
    throw new Error(`register ${who.email}: refused as too many sign-ups (RATE_LIMIT_REGISTER_IP): ${await limited.textContent()}`);
  }
}

/** A small PNG made by the browser itself (no binary fixture in the repo). */
export async function makePng(page) {
  const probe = await page.context().newPage();
  await probe.setViewportSize({ width: 320, height: 240 });
  await probe.setContent(
    `<body style="margin:0"><div id="p" style="width:320px;height:240px;background:#8e4ec6"></div></body>`,
  );
  const png = await probe.locator("#p").screenshot({ type: "png" });
  await probe.close();
  return png;
}

/** Waits for the client-rendered dashboard / form views to finish loading. */
export async function loaded(page) {
  await page.getByText("Loading…").first().waitFor({ state: "detached" });
}

/** Opens a shop from the dashboard (the account must have none yet). */
export async function openShop(page, { name, slug }) {
  await page.goto("/dashboard");
  await page.getByLabel("Shop name").fill(name);
  await page.getByLabel("City").fill("Taipei");
  await page.getByLabel("Shop web address").fill(slug);
  await page.getByRole("button", { name: "Create shop" }).click();
  await page.getByRole("heading", { name }).waitFor();
}

/** Adds a draft coffee with every required field; returns its dashboard edit path. */
/** Adds a draft coffee. `origin` / `process` / `notes` default to a washed Ethiopian like the seeded 耶加雪菲. */
export async function addCoffee(page, name, { origin = "Ethiopia", process = "Washed", notes = "jasmine, bergamot" } = {}) {
  await page.goto("/dashboard/coffees/new");
  await page.getByLabel("Name *").fill(name);
  await page.getByLabel("Origin *").selectOption({ label: origin });
  await page.getByLabel("Process *").selectOption({ label: process });
  await page.getByLabel("Variety *").selectOption({ label: "Heirloom" });
  await page.getByLabel("Producer *").fill("Konga Cooperative");
  await page.getByLabel("Region *").fill("Gedeo, Yirgacheffe");
  await page.getByLabel("Altitude (lowest) *").fill("1900");
  await page.getByLabel("Flavor notes *").fill(notes);
  await page.getByLabel("Price (NT$)").fill("480");
  await page.getByLabel("Stock").fill("12");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForURL((u) => u.pathname === "/dashboard");
  const row = dashboardRow(page, name);
  await row.getByText("Draft").waitFor();
  return row.getByRole("link", { name: "Edit" }).getAttribute("href");
}

/** The dashboard's list row for one coffee. */
export function dashboardRow(page, name) {
  return page.getByRole("listitem").filter({ hasText: name });
}

/** Publishes a coffee from the dashboard list. */
export async function publish(page, name) {
  await page.goto("/dashboard");
  const row = dashboardRow(page, name);
  await row.getByRole("button", { name: "Publish" }).click();
  await row.getByText("Published").waitFor();
}

/** The seeded demo coffee 耶加雪菲 (scripts/seed_dev.sql): whole bean 200 g NT$450 with 20 in stock, listed first. */
export const SEEDED_COFFEE_PATH = "/coffees/00000000-0000-4000-8000-000000000201";

/** Puts `quantity` bags of the seeded coffee's first option in the signed-in buyer's cart (#311). */
export async function addSeededToCart(page, quantity = 1) {
  await page.goto(SEEDED_COFFEE_PATH);
  await page.getByLabel("Quantity").selectOption(String(quantity));
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.getByText("Added to your cart.").waitFor();
}

/** Logs in through the UI. */
export async function login(page, email) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}
