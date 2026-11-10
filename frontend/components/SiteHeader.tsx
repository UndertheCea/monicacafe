import type { Locale } from "@/lib/i18n/dict";
import { NavDrawer } from "./NavDrawer";
import { SearchToggle } from "./SearchToggle";
import { Wordmark } from "./Wordmark";

/**
 * The same header at every width (#185, the owner's answer on #177): the menu
 * button (opens the navigation drawer), the wordmark centred, and a search
 * icon. Everything else (coffees, shops, map, language, account) is in the
 * drawer. The outer columns are the same width, so the wordmark sits in the
 * middle of the page.
 */
export function SiteHeader({ locale }: { locale: Locale }) {
  return (
    <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="relative mx-auto grid max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3">
        <div className="justify-self-start">
          <NavDrawer locale={locale} />
        </div>
        <Wordmark />
        <div className="justify-self-end">
          <SearchToggle locale={locale} />
        </div>
      </div>
    </header>
  );
}
