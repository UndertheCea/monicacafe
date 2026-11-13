// Shared helpers for the browser checks (#263, #264). Run against a live stack:
//   cd e2e && npm ci && BASE_URL=http://localhost npm test
import { mkdir } from "node:fs/promises";
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
  const file = new URL(`${name.replace(/[^a-z0-9-]+/gi, "-")}.png`, ARTIFACTS);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  return file.pathname;
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

/** Registers through the UI and waits until the session is live. */
export async function register(page, who) {
  await page.goto("/register");
  await page.getByLabel("Display name").fill(who.name);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/register"));
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
  await page.getByLabel("URL name").fill(slug);
  await page.getByRole("button", { name: "Create shop" }).click();
  await page.getByRole("heading", { name }).waitFor();
}

/** Adds a draft coffee with every required field; returns its dashboard edit path. */
export async function addCoffee(page, name) {
  await page.goto("/dashboard/coffees/new");
  await page.getByLabel("Name *").fill(name);
  await page.getByLabel("Origin *").selectOption({ label: "Ethiopia" });
  await page.getByLabel("Process *").selectOption({ label: "Washed" });
  await page.getByLabel("Variety *").selectOption({ label: "Heirloom" });
  await page.getByLabel("Producer *").fill("Konga Cooperative");
  await page.getByLabel("Region *").fill("Gedeo, Yirgacheffe");
  await page.getByLabel("Altitude (lowest) *").fill("1900");
  await page.getByLabel("Flavor notes *").fill("jasmine, bergamot");
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
