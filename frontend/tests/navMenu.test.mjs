// Navigation drawer menu (lib/navMenu.ts, #175). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { FULL_NAV_QUERY, NAV_DRAWER_BREAKPOINT_PX, navMenu } from "../lib/navMenu.ts";
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
    ["buyer", { signedIn: true, role: "BUYER", hasShop: false }, [...signedIn, "nav.logout!logout"]],
    ["seller without a shop yet", { signedIn: true, role: "SELLER", hasShop: false }, [...signedIn, "nav.logout!logout"]],
    ["seller", { signedIn: true, role: "SELLER", hasShop: true }, [...signedIn, "nav.dashboard=/dashboard", "nav.logout!logout"]],
    ["admin", { signedIn: true, role: "ADMIN", hasShop: false }, [...signedIn, "nav.logout!logout"]],
  ];
  for (const [name, viewer, account] of cases) {
    assert.deepEqual(flat(navMenu(viewer)), [...browse, ["nav.accountSection", account]], name);
  }
});

test("navMenu: every label is translated in both languages", () => {
  const viewers = [{ signedIn: false }, { signedIn: true, role: "SELLER", hasShop: true }];
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

test("the drawer folds below lg (1024 px)", () => {
  assert.equal(NAV_DRAWER_BREAKPOINT_PX, 1024);
  assert.equal(FULL_NAV_QUERY, "(min-width: 1024px)");
});
