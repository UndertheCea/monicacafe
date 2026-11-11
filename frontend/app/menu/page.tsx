import type { Metadata } from "next";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { NavMenuList } from "@/components/NavMenuList";
import { Page } from "@/components/Page";

// The navigation drawer's links as a plain page (#175): where the header's
// menu button goes when JavaScript isn't running.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: t(locale, "nav.menuTitle"), robots: { index: false } };
}

export default async function MenuPage() {
  const locale = await getLocale();
  return (
    <Page className="py-10">
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-2xl font-bold text-ink">{t(locale, "nav.menuTitle")}</h1>
      <nav aria-label={t(locale, "nav.menuTitle")}>
        <NavMenuList locale={locale} headingLevel={2} />
      </nav>
    </div>
    </Page>
  );
}
