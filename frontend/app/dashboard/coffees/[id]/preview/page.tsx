import type { Metadata } from "next";
import Link from "next/link";
import { CoffeePreview } from "@/components/dashboard/CoffeePreview";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { Page } from "@/components/Page";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "preview.title"), robots: { index: false } };
}

export default async function CoffeePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await getLocale();
  return (
    <Page className="py-10">
      <Link href={`/dashboard/coffees/${id}`} className="text-sm font-medium text-ink underline-offset-4 hover:underline">
        {t(locale, "preview.back")}
      </Link>
      <CoffeePreview coffeeId={id} locale={locale} />
    </Page>
  );
}
