"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useId } from "react";
import { t, type Locale } from "@/lib/i18n/dict";
import { authHref, NAV_HOME, NAV_LANGUAGE_LABEL, navMenu, type NavViewer } from "@/lib/navMenu";
import { useAuth } from "./auth/AuthProvider";
import { LanguageToggle } from "./LanguageToggle";
import { LinkPending } from "./LinkPending";

/**
 * The navigation drawer's contents (#175; the only site navigation since #185), also the body of the no-JavaScript
 * /menu page: a Home link first, then section headings in small caps on the left with their links
 * beside them, then the language switch labelled the same way (#331). `onNavigate` lets the drawer close when a
 * link is followed. While the session is loading (and without JavaScript) the
 * signed-out links are shown.
 */
export function NavMenuList({
  locale,
  onNavigate,
  headingLevel = 3,
  returnTo,
}: {
  locale: Locale;
  /** On /menu, the page it was opened from (#416): sign-in and the language switch go back there. */
  returnTo?: string | null;
  onNavigate?: () => void;
  /** 3 under the drawer's h2 title; 2 on the /menu page (under its h1). */
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const idBase = useId();
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Login / register bring the visitor back to this page afterwards.
  const hrefOf = (href: string) => (href === "/login" || href === "/register" ? authHref(href, returnTo ?? pathname) : href);
  const viewer: NavViewer = user
    ? { signedIn: true, role: user.role, hasShop: user.shop !== null }
    : { signedIn: false };
  const linkCls = "block py-1.5 text-base text-ink underline-offset-4 hover:underline";

  const rowCls = "grid grid-cols-[6.5rem_1fr] gap-3 py-4";

  return (
    <div>
      <p className="pb-3">
        <Link href={NAV_HOME.href} className={`${linkCls} font-bold`} onClick={onNavigate}>
          {t(locale, NAV_HOME.label)}
          <LinkPending />
        </Link>
      </p>
      <ul className="divide-y divide-line border-y border-line">
        {navMenu(viewer).map((s) => (
          <li key={s.label} className={rowCls}>
            <Heading id={`${idBase}-${s.label}`} className="label-caps pt-2.5 text-muted">
              {t(locale, s.label)}
            </Heading>
            {/* Named by its heading, so two "All" links read as "Coffees" / "Shops" lists. */}
            <ul aria-labelledby={`${idBase}-${s.label}`}>
              {s.items.map((item) => (
                <li key={`${item.label}-${"href" in item ? item.href : item.action}`}>
                  {"href" in item ? (
                    <Link href={hrefOf(item.href)} className={linkCls} onClick={onNavigate}>
                      {t(locale, item.label)}
                      <LinkPending />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className={`${linkCls} w-full text-left`}
                      onClick={async () => {
                        onNavigate?.();
                        await logout();
                        router.refresh();
                      }}
                    >
                      {t(locale, item.label)}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {/* Labelled like a section (#331); a control, not a list of pages. */}
      <div role="group" aria-labelledby={`${idBase}-lang`} className={`${rowCls} border-b border-line`}>
        <span id={`${idBase}-lang`} className="label-caps pt-2.5 text-muted">
          {t(locale, NAV_LANGUAGE_LABEL)}
        </span>
        <div>
          <LanguageToggle locale={locale} returnTo={returnTo} />
        </div>
      </div>
    </div>
  );
}
