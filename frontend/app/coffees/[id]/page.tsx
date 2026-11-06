import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { COFFEE_PAGE, isUUID } from "@/lib/api";
import { query } from "@/lib/graphql";
import { MORE_FROM_SHOP, moreFromShop } from "@/lib/moreFromShop";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { coffeeJsonLd, serializeJsonLd, shareMetadata } from "@/lib/seo";
import { siteBase } from "@/lib/sitemap";
import { CoffeeDetailView } from "@/components/coffees/CoffeeDetailView";
import { CommentList } from "@/components/coffees/CommentList";
import { MoreFromShop } from "@/components/coffees/MoreFromShop";
import { ErrorState } from "@/components/ErrorState";

type Params = Promise<{ id: string }>;

// Deduplicate the fetch between generateMetadata and the page render.
const loadCoffee = cache(async (id: string) =>
  isUUID(id) ? (await query(COFFEE_PAGE, { id, more: MORE_FROM_SHOP + 1 })).coffee : null,
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
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      {/* Structured data for search engines. Public, published pages only (the
          draft preview never renders this page); serializeJsonLd escapes seller text. */}
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(coffeeJsonLd(coffee, siteBase(process.env.SITE_URL))) }}
      />
      <Link href="/coffees" className="text-sm font-medium text-amber-700 hover:underline">
        {t(locale, "coffee.back")}
      </Link>

      <CoffeeDetailView coffee={coffee} locale={locale} />

      <CommentList
        coffeeId={coffee.id}
        isPublished={coffee.isPublished}
        comments={coffee.comments} total={coffee.commentCount} locale={locale} />

      <MoreFromShop
        coffees={moreFromShop(coffee.more.coffees.nodes, coffee.id)}
        total={coffee.more.coffees.total}
        shop={coffee.shop}
        locale={locale}
      />
    </main>
  );
}
