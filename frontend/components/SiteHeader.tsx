import Link from "next/link";
import { Suspense } from "react";
import { t, type Locale } from "@/lib/i18n/dict";
import { AccountMenu } from "./auth/AccountMenu";
import { HeaderSearch, HeaderSearchForm } from "./HeaderSearch";
import { LanguageToggle } from "./LanguageToggle";
import { Wordmark } from "./Wordmark";

export function SiteHeader({ locale }: { locale: Locale }) {
  return (
    <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <Wordmark sub={t(locale, "brand.tagline")} />
        <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm font-medium text-neutral-700">
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
