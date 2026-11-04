import Link from "next/link";
import { t, type Locale } from "@/lib/i18n/dict";
import { LanguageToggle } from "./LanguageToggle";

export function SiteHeader({ locale }: { locale: Locale }) {
  return (
    <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-lg font-bold tracking-widest text-stone-900">MONI CAFE</span>
          <span className="hidden text-xs text-stone-500 sm:inline">{t(locale, "brand.tagline")}</span>
        </Link>
        <nav className="flex items-center gap-5 text-sm font-medium text-stone-700">
          <Link href="/coffees" className="hover:text-amber-700">
            {t(locale, "nav.coffees")}
          </Link>
          <LanguageToggle locale={locale} />
        </nav>
      </div>
    </header>
  );
}
