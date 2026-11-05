import type { Metadata } from "next";
import Link from "next/link";
import { VariantManager } from "@/components/dashboard/VariantManager";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "cf.manageTitle"), robots: { index: false } };
}

export default async function ManageCoffeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await getLocale();
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Link href="/dashboard" className="text-sm font-medium text-amber-700 hover:underline">
        {t(locale, "cf.back")}
      </Link>
      <h1 className="mb-6 mt-4 text-3xl font-bold text-stone-900">{t(locale, "cf.manageTitle")}</h1>
      <VariantManager coffeeId={id} locale={locale} />
    </main>
  );
}
