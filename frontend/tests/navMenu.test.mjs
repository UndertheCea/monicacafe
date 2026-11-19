// Navigation drawer menu (lib/navMenu.ts, #175, #185). Run with `npm test`.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { authHref, loginHrefFrom, menuFrom, menuHref, NAV_HOME, NAV_LANGUAGE_LABEL, navMenu } from "../lib/navMenu.ts";
import { t } from "../lib/i18n/dict.ts";

const flat = (sections) =>
  sections.map((s) => [s.label, s.items.map((i) => ("href" in i ? `${i.label}=${i.href}` : `${i.label}!${i.action}`))]);

test("navMenu: the menu for each kind of viewer", () => {
  const browse = [
    ["nav.coffees", ["nav.all=/coffees"]],
    ["nav.shops", ["nav.all=/shops", "nav.map=/map"]],
  ];
  const signedIn = ["nav.cart=/cart", "nav.saved=/account#saved-coffees", "nav.following=/account#followed-shops", "nav.settings=/account"];
  const cases = [
    ["signed out", { signedIn: false }, ["nav.login=/login", "nav.register=/register"]],
    ["buyer", { signedIn: true, role: "BUYER", hasShop: false }, [...signedIn, "nav.openShop=/dashboard", "nav.logout!logout"]],
    ["seller without a shop yet", { signedIn: true, role: "SELLER", hasShop: false }, [...signedIn, "nav.openShop=/dashboard", "nav.logout!logout"]],
    ["seller", { signedIn: true, role: "SELLER", hasShop: true }, [...signedIn, "nav.dashboard=/dashboard", "nav.logout!logout"]],
    ["admin", { signedIn: true, role: "ADMIN", hasShop: false }, [...signedIn, "nav.openShop=/dashboard", "nav.admin=/admin", "nav.logout!logout"]],
  ];
  for (const [name, viewer, account] of cases) {
    assert.deepEqual(flat(navMenu(viewer)), [...browse, ["nav.accountSection", account]], name);
  }
});

test("navMenu: every label is translated in both languages", () => {
  const viewers = [
    { signedIn: false },
    { signedIn: true, role: "SELLER", hasShop: true },
    { signedIn: true, role: "BUYER", hasShop: false },
    { signedIn: true, role: "ADMIN", hasShop: false },
  ];
  for (const v of viewers) {
    for (const s of navMenu(v)) {
      for (const key of [s.label, ...s.items.map((i) => i.label)]) {
        for (const locale of ["zh-TW", "en"]) {
          const text = t(locale, key);
          assert.ok(text && text !== key, `${locale} ${key}`);
        }
      }
    }
  }
});

// #331: Home first, outside the sections; the language switch has a label; the heading is screen-reader only.
test("navMenu: Home comes first and the language switch is labelled", () => {
  assert.deepEqual(NAV_HOME, { label: "nav.home", href: "/" });
  for (const v of [{ signedIn: false }, { signedIn: true, role: "SELLER", hasShop: true }]) {
    const hrefs = navMenu(v).flatMap((s) => s.items.map((i) => i.href));
    assert.ok(!hrefs.includes("/"), "Home is not repeated inside a section");
  }
  const want = { "zh-TW": ["首頁", "語言"], en: ["Home", "Language"] };
  for (const [locale, [home, lang]] of Object.entries(want)) {
    assert.equal(t(locale, NAV_HOME.label), home);
    assert.equal(t(locale, NAV_LANGUAGE_LABEL), lang);
  }
  const list = readFileSync(new URL("../components/NavMenuList.tsx", import.meta.url), "utf8");
  assert.ok(list.indexOf("NAV_HOME.href") < list.indexOf("navMenu(viewer)"), "Home renders above the sections");
  assert.match(list, /aria-labelledby=\{`\$\{idBase\}-lang`\}/);
  const drawer = readFileSync(new URL("../components/NavDrawer.tsx", import.meta.url), "utf8");
  assert.match(drawer, /\bhideTitle\b/);
  assert.match(drawer, /<nav aria-label=\{t\(locale, "nav.menuTitle"\)\}>/);
  const page = readFileSync(new URL("../app/menu/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<PageTitle className="sr-only">/);
});

test("authHref: login / register come back to the page being viewed", () => {
  const cases = [
    ["/login", "/coffees/abc", "/login?next=%2Fcoffees%2Fabc"],
    ["/register", "/shops/dawn", "/register?next=%2Fshops%2Fdawn"],
    ["/login", "/", "/login"],
    ["/login", "/menu", "/login"],
    ["/login", "/login", "/login"],
    ["/register", "/register", "/register"],
    ["/login", "//evil.example", "/login"],
    ["/login", "https://evil.example/", "/login"],
    ["/login", null, "/login"],
    ["/login", undefined, "/login"],
  ];
  for (const [path, from, want] of cases) assert.equal(authHref(path, from), want, `${path} from ${from}`);
});

// #185 (owner's answer on #177): one header at every width, no lg split left over.
test("the header is the same at every width", () => {
  for (const f of ["SiteHeader.tsx", "NavDrawer.tsx", "SearchToggle.tsx", "HeaderSearch.tsx"]) {
    const src = readFileSync(new URL(`../components/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /\b(sm|md|lg|xl):(hidden|flex|block|inline-flex)\b/, f);
    assert.doesNotMatch(src, /matchMedia/, f);
  }
});

test("loginHrefFrom: keeps the query, encoded; no trailing ? when empty", () => {
  const cases = [
    ["/shops/moni", "", "/login?next=%2Fshops%2Fmoni"],
    ["/shops/moni", "?", "/login?next=%2Fshops%2Fmoni"],
    ["/shops/moni", null, "/login?next=%2Fshops%2Fmoni"],
    ["/shops/moni", "page=2&archive=3", "/login?next=%2Fshops%2Fmoni%3Fpage%3D2%26archive%3D3"],
    ["/coffees/abc", "?page=2", "/login?next=%2Fcoffees%2Fabc%3Fpage%3D2"],
    ["//evil.example", "page=2", "/login"],
  ];
  for (const [path, search, want] of cases) assert.equal(loginHrefFrom(path, search), want, `${path} ${search}`);
});

test("menuHref: the no-JS menu link carries the page it was opened from (#416)", () => {
  assert.equal(menuHref("/coffees", "q=ethiopia&page=2"), "/menu?from=%2Fcoffees%3Fq%3Dethiopia%26page%3D2");
  assert.equal(menuHref("/coffees", "?q=a"), "/menu?from=%2Fcoffees%3Fq%3Da");
  assert.equal(menuHref("/shops/abc"), "/menu?from=%2Fshops%2Fabc");
  assert.equal(menuHref("/", "page=2"), "/menu?from=%2F%3Fpage%3D2");
  for (const [p, q] of [["/", ""], ["/", null], ["/menu", "from=%2Fcoffees"], ["//evil.example", ""], ["coffees", ""]]) {
    assert.equal(menuHref(p, q), "/menu", `${p} ${q}`);
  }
});

test("menuFrom: only same-site pages other than /menu come back (#416)", () => {
  assert.equal(menuFrom("/coffees?q=ethiopia&page=2"), "/coffees?q=ethiopia&page=2");
  assert.equal(menuFrom(["/shops", "/x"]), "/shops");
  assert.equal(menuFrom("/"), "/");
  for (const bad of [undefined, "", "https://evil.example/", "//evil.example", "/api/locale", "/menu", "/menu?from=%2F", "javascript:alert(1)", "/\\evil"]) {
    assert.equal(menuFrom(bad), null, String(bad));
  }
});
