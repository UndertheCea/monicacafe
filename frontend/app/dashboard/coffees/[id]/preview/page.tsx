import type { Metadata } from "next";
import Link from "next/link";
import { CoffeePreview } from "@/components/dashboard/CoffeePreview";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "preview.title"), robots: { index: false } };
}

export default async function CoffeePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await getLocale();
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Link href={`/dashboard/coffees/${id}`} className="text-sm font-medium text-amber-700 hover:underline">
        {t(locale, "preview.back")}
      </Link>
      <CoffeePreview coffeeId={id} locale={locale} />
    </main>
  );
}
