import type { Locale } from "@/lib/i18n/dict";
import { CartLink } from "./cart/CartLink";
import { NavDrawer } from "./NavDrawer";
import { SearchToggle } from "./SearchToggle";
import { Wordmark } from "./Wordmark";
import { Page } from "@/components/Page";

/**
 * The same header at every width (#185, the owner's answer on #177): the menu
 * button (opens the navigation drawer), the wordmark centred, and a search
 * icon. Everything else (coffees, shops, map, language, account) is in the
 * drawer. The outer columns are the same width, so the wordmark sits in the
 * middle of the page. Signed-in visitors also get a cart link beside the
 * search icon (#311).
 */
export function SiteHeader({ locale }: { locale: Locale }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-white">
      <Page className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-3">
        <div className="justify-self-start">
          <NavDrawer locale={locale} />
        </div>
        <Wordmark />
        <div className="flex items-center gap-2 justify-self-end">
          <CartLink locale={locale} />
          <SearchToggle locale={locale} />
        </div>
      </Page>
    </header>
  );
}
