import type { Metadata } from "next";
import { AccountSettings } from "@/components/account/AccountSettings";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { Page } from "@/components/Page";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "account.title"), robots: { index: false } };
}

export default async function AccountPage() {
  const locale = await getLocale();
  return (
    <Page className="py-10">
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-3xl font-bold text-ink">{t(locale, "account.title")}</h1>
      <AccountSettings locale={locale} />
    </div>
    </Page>
  );
}
