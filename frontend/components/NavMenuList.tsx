"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useId } from "react";
import { t, type Locale } from "@/lib/i18n/dict";
import { authHref, navMenu, type NavViewer } from "@/lib/navMenu";
import { useAuth } from "./auth/AuthProvider";
import { LanguageToggle } from "./LanguageToggle";
import { LinkPending } from "./LinkPending";

/**
 * The navigation drawer's contents (#175; the only site navigation since #185), also the body of the no-JavaScript
 * /menu page: section headings in small caps on the left, their links beside
 * them, then the language switch. `onNavigate` lets the drawer close when a
 * link is followed. While the session is loading (and without JavaScript) the
 * signed-out links are shown.
 */
export function NavMenuList({
  locale,
  onNavigate,
  headingLevel = 3,
}: {
  locale: Locale;
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
  const hrefOf = (href: string) => (href === "/login" || href === "/register" ? authHref(href, pathname) : href);
  const viewer: NavViewer = user
    ? { signedIn: true, role: user.role, hasShop: user.shop !== null }
    : { signedIn: false };
  const linkCls = "block py-1.5 text-base text-ink underline-offset-4 hover:underline";

  return (
    <div>
      <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
        {navMenu(viewer).map((s) => (
          <li key={s.label} className="grid grid-cols-[6.5rem_1fr] gap-3 py-4">
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
      <div className="mt-5">
        <LanguageToggle locale={locale} />
      </div>
    </div>
  );
}
