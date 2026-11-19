import type { Metadata } from "next";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { NavMenuList } from "@/components/NavMenuList";
import { menuFrom } from "@/lib/navMenu";
import { Page } from "@/components/Page";
import { PageTitle } from "@/components/ui";

// The navigation drawer's links as a plain page (#175): where the header's
// menu button goes when JavaScript isn't running.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: t(locale, "nav.menuTitle"), robots: { index: false } };
}

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ from?: string | string[] }> }) {
  const [sp, locale] = await Promise.all([searchParams, getLocale()]);
  // The page the menu was opened from (#416): the language switch and sign-in go back there.
  const returnTo = menuFrom(sp.from);
  return (
    <Page className="py-10">
    <div className="mx-auto max-w-md">
      {/* Named for screen readers only, like the drawer (#331). */}
      <PageTitle className="sr-only">{t(locale, "nav.menuTitle")}</PageTitle>
      <nav aria-label={t(locale, "nav.menuTitle")}>
        <NavMenuList locale={locale} headingLevel={2} returnTo={returnTo} />
      </nav>
    </div>
    </Page>
  );
}
