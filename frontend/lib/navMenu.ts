// The site navigation drawer's menu (#175): two levels, like a roaster's shop
// menu. Built from the auth state so the drawer, the no-JavaScript /menu page
// and the tests agree. No imports, so `npm test` can load it directly.

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
 * (it's a control, not a page). "Seller dashboard" is shown only to an
 * account that has a shop; opening one stays in the account menu and on
 * /account.
 */
export function navMenu(v: NavViewer): NavSection[] {
  const account: NavItem[] = v.signedIn
    ? [
        { label: "nav.saved", href: "/account#saved-coffees" },
        { label: "nav.following", href: "/account#followed-shops" },
        { label: "nav.settings", href: "/account" },
        ...(v.hasShop ? [{ label: "nav.dashboard" as const, href: "/dashboard" }] : []),
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
 * Tailwind's `lg` breakpoint in px. Below it the header folds into a menu
 * button + the drawer; from it up the full row is shown. Keep in step with the
 * `lg:` classes in SiteHeader and NavDrawer.
 */
export const NAV_DRAWER_BREAKPOINT_PX = 1024;

/** The media query for "the full header row is shown, so no drawer". */
export const FULL_NAV_QUERY = `(min-width: ${NAV_DRAWER_BREAKPOINT_PX}px)`;
