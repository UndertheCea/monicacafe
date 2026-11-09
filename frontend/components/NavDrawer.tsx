"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { t, type Locale } from "@/lib/i18n/dict";
import { FULL_NAV_QUERY } from "@/lib/navMenu";
import { Drawer } from "./Drawer";
import { NavMenuList } from "./NavMenuList";

const noSubscribe = () => () => {};

const buttonCls =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neutral-300 text-ink hover:border-ink";

function MenuIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M3 5.5h14M3 10h14M3 14.5h14" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Below lg the header folds to a menu button that opens the site navigation
 * in the shared side drawer (#175). Without JavaScript the button is a link to
 * the plain /menu page with the same links.
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

  // Widening the window to lg+ shows the full header row, so the drawer goes.
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia(FULL_NAV_QUERY);
    const onChange = () => mq.matches && setOpen(false);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [open]);

  if (!hydrated) {
    return (
      <Link href="/menu" className={`${buttonCls} lg:hidden`} aria-label={t(locale, "nav.menuOpen")}>
        <MenuIcon />
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`${buttonCls} lg:hidden`}
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
        closeLabel={t(locale, "nav.menuClose")}
      >
        <nav aria-label={t(locale, "nav.menuTitle")}>
          <NavMenuList locale={locale} onNavigate={() => setOpen(false)} />
        </nav>
      </Drawer>
    </>
  );
}
