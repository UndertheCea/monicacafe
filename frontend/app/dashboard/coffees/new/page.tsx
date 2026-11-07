import type { Metadata } from "next";
import Link from "next/link";
import { NewCoffeeForm } from "@/components/dashboard/NewCoffeeForm";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "cf.newTitle"), robots: { index: false } };
}

export default async function NewCoffeePage() {
  const locale = await getLocale();
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link href="/dashboard" className="text-sm font-medium text-amber-700 hover:underline">
        {t(locale, "cf.back")}
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-stone-900">{t(locale, "cf.newTitle")}</h1>
      <p className="mb-6 mt-1 text-stone-600">{t(locale, "cf.newSub")}</p>
      <NewCoffeeForm locale={locale} />
    </div>
  );
}
