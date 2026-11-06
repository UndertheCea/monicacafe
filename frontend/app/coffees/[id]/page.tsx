import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { COFFEE, isUUID } from "@/lib/api";
import { query } from "@/lib/graphql";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { shareMetadata } from "@/lib/seo";
import { siteBase } from "@/lib/sitemap";
import { CoffeeDetailView } from "@/components/coffees/CoffeeDetailView";
import { CommentList } from "@/components/coffees/CommentList";
import { ErrorState } from "@/components/ErrorState";

type Params = Promise<{ id: string }>;

// Deduplicate the fetch between generateMetadata and the page render.
const loadCoffee = cache(async (id: string) =>
  isUUID(id) ? (await query(COFFEE, { id })).coffee : null,
);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const locale = await getLocale();
  try {
    const c = await loadCoffee(id);
    if (!c) return { title: t(locale, "coffee.notFound") };
    const title = `${c.name} · ${c.shop.name}`;
    return {
      title,
      ...shareMetadata({
        base: siteBase(process.env.SITE_URL),
        path: `/coffees/${c.id}`,
        title,
        description: c.description,
        images: [c.imageUrls[0], c.shop.logoUrl],
        locale,
        type: "article",
      }),
    };
  } catch {
    return { title: t(locale, "coffees.title") };
  }
}

export default async function CoffeeDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const locale = await getLocale();

  let coffee;
  try {
    coffee = await loadCoffee(id);
  } catch (err) {
    return <ErrorState locale={locale} error={err} />;
  }
  if (!coffee) notFound();

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Link href="/coffees" className="text-sm font-medium text-amber-700 hover:underline">
        {t(locale, "coffee.back")}
      </Link>

      <CoffeeDetailView coffee={coffee} locale={locale} />

      <CommentList
        coffeeId={coffee.id}
        isPublished={coffee.isPublished}
        comments={coffee.comments} total={coffee.commentCount} locale={locale} />
    </main>
  );
}
