// Navigation drawer menu (lib/navMenu.ts, #175, #185). Run with `npm test`.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { authHref, navMenu } from "../lib/navMenu.ts";
import { t } from "../lib/i18n/dict.ts";

const flat = (sections) =>
  sections.map((s) => [s.label, s.items.map((i) => ("href" in i ? `${i.label}=${i.href}` : `${i.label}!${i.action}`))]);

test("navMenu: the menu for each kind of viewer", () => {
  const browse = [
    ["nav.coffees", ["nav.all=/coffees"]],
    ["nav.shops", ["nav.all=/shops", "nav.map=/map"]],
  ];
  const signedIn = ["nav.saved=/account#saved-coffees", "nav.following=/account#followed-shops", "nav.settings=/account"];
  const cases = [
    ["signed out", { signedIn: false }, ["nav.login=/login", "nav.register=/register"]],
    ["buyer", { signedIn: true, role: "BUYER", hasShop: false }, [...signedIn, "nav.openShop=/dashboard", "nav.logout!logout"]],
    ["seller without a shop yet", { signedIn: true, role: "SELLER", hasShop: false }, [...signedIn, "nav.openShop=/dashboard", "nav.logout!logout"]],
    ["seller", { signedIn: true, role: "SELLER", hasShop: true }, [...signedIn, "nav.dashboard=/dashboard", "nav.logout!logout"]],
    ["admin", { signedIn: true, role: "ADMIN", hasShop: false }, [...signedIn, "nav.openShop=/dashboard", "nav.logout!logout"]],
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
