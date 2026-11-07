import type { Metadata } from "next";
import { AccountSettings } from "@/components/account/AccountSettings";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "account.title"), robots: { index: false } };
}

export default async function AccountPage() {
  const locale = await getLocale();
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-3xl font-bold text-stone-900">{t(locale, "account.title")}</h1>
      <AccountSettings locale={locale} />
    </div>
  );
}
