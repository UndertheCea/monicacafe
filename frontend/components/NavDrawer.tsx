"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState, useSyncExternalStore } from "react";
import { t, type Locale } from "@/lib/i18n/dict";
import { Drawer } from "./Drawer";
import { NavMenuList } from "./NavMenuList";
import { menuHref } from "@/lib/navMenu";
import { ICON_BUTTON } from "@/lib/ui";

const noSubscribe = () => () => {};

function MenuIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M3 5.5h14M3 10h14M3 14.5h14" strokeLinecap="round" />
    </svg>
  );
}

/** The no-JavaScript menu link, carrying the page it was opened from (#416). */
function MenuLink({ locale, href }: { locale: Locale; href: string }) {
  return (
    <Link href={href} className={ICON_BUTTON} aria-label={t(locale, "nav.menuOpen")}>
      <MenuIcon />
    </Link>
  );
}

function MenuLinkWithSearch({ locale, pathname }: { locale: Locale; pathname: string }) {
  const search = useSearchParams().toString();
  return <MenuLink locale={locale} href={menuHref(pathname, search)} />;
}

/**
 * The header's menu button: it opens the site navigation in the shared side
 * drawer (#175), at every width (#185). Without JavaScript the button is a
 * link to the plain /menu page with the same links.
 */
export function NavDrawer({ locale }: { locale: Locale }) {
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on navigation (e.g. browser back while open): adjust state while rendering.
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(false);
  }

  if (!hydrated) {
    // useSearchParams sits under Suspense so static pages stay static; their
    // fallback link carries the path alone.
    return (
      <Suspense fallback={<MenuLink locale={locale} href={menuHref(pathname)} />}>
        <MenuLinkWithSearch locale={locale} pathname={pathname} />
      </Suspense>
    );
  }

  return (
    <>
      <button
        type="button"
        className={ICON_BUTTON}
        aria-label={t(locale, "nav.menuOpen")}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="site-nav"
        onClick={() => setOpen(true)}
      >
        <MenuIcon />
      </button>
      <Drawer
        id="site-nav"
        open={open}
        onClose={() => setOpen(false)}
        title={t(locale, "nav.menuTitle")}
        hideTitle
        closeLabel={t(locale, "nav.menuClose")}
      >
        <nav aria-label={t(locale, "nav.menuTitle")}>
          <NavMenuList locale={locale} onNavigate={() => setOpen(false)} />
        </nav>
      </Drawer>
    </>
  );
}
