import type { Metadata } from "next";
import { CartView } from "@/components/cart/CartView";
import { Page } from "@/components/Page";
import { PageTitle } from "@/components/ui";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "cart.title"), robots: { index: false } };
}

/** The buyer's cart (#280). Client-rendered: it needs the signed-in session. */
export default async function CartPage() {
  const locale = await getLocale();
  return (
    <Page className="py-10">
      <div className="mx-auto max-w-2xl">
        <PageTitle className="mb-6">{t(locale, "cart.title")}</PageTitle>
        <CartView locale={locale} />
      </div>
    </Page>
  );
}
