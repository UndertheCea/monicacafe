// The site navigation drawer's menu (#175; at every width since #185, the
// owner's answer on #177): two levels, like a roaster's shop menu. The header
// is only the menu button, the wordmark and search, so everything the old
// desktop row held lives here. Built from the auth state so the drawer, the
// no-JavaScript /menu page and the tests agree. No imports, so `npm test` can
// load it directly.

/** Who is looking: signed out, or signed in with or without a shop / admin role. */
export type NavViewer =
  | { signedIn: false }
  | { signedIn: true; role: "BUYER" | "SELLER" | "ADMIN"; hasShop: boolean };

/** A dictionary key for a menu label (keys live in lib/i18n/dict.ts). */
export type NavLabel =
  | "nav.coffees"
  | "nav.shops"
  | "nav.map"
  | "nav.all"
  | "nav.accountSection"
  | "nav.saved"
  | "nav.following"
  | "nav.settings"
  | "nav.dashboard"
  | "nav.openShop"
  | "nav.admin"
  | "nav.login"
  | "nav.register"
  | "nav.logout";

/** A link, or the sign-out action (a button: it posts, it isn't a page). */
export type NavItem = { label: NavLabel; href: string } | { label: "nav.logout"; action: "logout" };

export interface NavSection {
  /** Small-caps heading. */
  label: NavLabel;
  items: NavItem[];
}

/**
 * The drawer's sections, top to bottom. The language switch goes below them
 * (it's a control, not a page). An account with a shop gets "Seller
 * dashboard"; any other signed-in account gets "Open a shop" (both are
 * /dashboard, which offers to open one when there is none).
 */
export function navMenu(v: NavViewer): NavSection[] {
  const account: NavItem[] = v.signedIn
    ? [
        { label: "nav.saved", href: "/account#saved-coffees" },
        { label: "nav.following", href: "/account#followed-shops" },
        { label: "nav.settings", href: "/account" },
        { label: v.hasShop ? "nav.dashboard" : "nav.openShop", href: "/dashboard" },
        // Moderation screen (#225); the API checks the role again on every call.
        ...(v.role === "ADMIN" ? [{ label: "nav.admin" as const, href: "/admin" }] : []),
        { label: "nav.logout", action: "logout" },
      ]
    : [
        { label: "nav.login", href: "/login" },
        { label: "nav.register", href: "/register" },
      ];
  return [
    { label: "nav.coffees", items: [{ label: "nav.all", href: "/coffees" }] },
    {
      label: "nav.shops",
      items: [
        { label: "nav.all", href: "/shops" },
        { label: "nav.map", href: "/map" },
      ],
    },
    { label: "nav.accountSection", items: account },
  ];
}

/**
 * The login / register link from the page being viewed: `?next=` brings the
 * visitor back after signing in. Not added from the auth pages, /menu or the
 * home page (the default already lands there), nor for anything that isn't a
 * same-site path.
 */
export function authHref(path: "/login" | "/register", from: string | null | undefined): string {
  if (!from || !from.startsWith("/") || from.startsWith("//") || from === "/" || from === "/menu" || from === "/login" || from === "/register") {
    return path;
  }
  return `${path}?next=${encodeURIComponent(from)}`;
}
