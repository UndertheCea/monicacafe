import type { Metadata } from "next";
import Link from "next/link";
import { ShopProfileForm } from "@/components/dashboard/ShopProfileForm";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "shop.editTitle"), robots: { index: false } };
}

export default async function ShopProfilePage() {
  const locale = await getLocale();
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link href="/dashboard" className="text-sm font-medium text-ink underline-offset-4 hover:underline">
        {t(locale, "cf.back")}
      </Link>
      <h1 className="mb-6 mt-4 text-3xl font-bold text-ink">{t(locale, "shop.editTitle")}</h1>
      <ShopProfileForm locale={locale} />
    </div>
  );
}
