import Link from "next/link";
import { Suspense } from "react";
import { t, type Locale } from "@/lib/i18n/dict";
import { AccountMenu } from "./auth/AccountMenu";
import { HeaderSearch, HeaderSearchForm } from "./HeaderSearch";
import { LanguageToggle } from "./LanguageToggle";
import { NavDrawer } from "./NavDrawer";
import { SearchToggle } from "./SearchToggle";
import { Wordmark } from "./Wordmark";

/**
 * lg+: wordmark, then the links, search, language and account in one row.
 * Below lg (#175): one row of menu button (opens the navigation drawer),
 * wordmark and a search icon; everything else is in the drawer.
 */
export function SiteHeader({ locale }: { locale: Locale }) {
  return (
    <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="relative mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 lg:gap-4">
        <NavDrawer locale={locale} />
        <Wordmark />
        <SearchToggle locale={locale} />
        <nav
          aria-label={t(locale, "nav.primary")}
          className="hidden items-center justify-end gap-x-4 text-sm font-medium text-neutral-700 lg:flex"
        >
          <Link href="/coffees" className="hover:text-ink hover:underline underline-offset-4">
            {t(locale, "nav.coffees")}
          </Link>
          <Link href="/shops" className="hover:text-ink hover:underline underline-offset-4">
            {t(locale, "nav.shops")}
          </Link>
          <Link href="/map" className="hover:text-ink hover:underline underline-offset-4">
            {t(locale, "nav.map")}
          </Link>
          <Suspense fallback={<HeaderSearchForm locale={locale} />}>
            <HeaderSearch locale={locale} />
          </Suspense>
          <LanguageToggle locale={locale} />
          <AccountMenu locale={locale} />
        </nav>
      </div>
    </header>
  );
}
