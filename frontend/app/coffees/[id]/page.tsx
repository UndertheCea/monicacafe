import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { COFFEE_PAGE, isUUID } from "@/lib/api";
import { query } from "@/lib/graphql";
import { MORE_FROM_SHOP, SIMILAR_COFFEES, alsoLike, moreFromShop } from "@/lib/moreFromShop";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { provenanceFacts } from "@/lib/provenance";
import { cupScalesOf } from "@/lib/cupProfile";
import { coffeeJsonLd, serializeJsonLd, shareMetadata } from "@/lib/seo";
import { siteBase } from "@/lib/sitemap";
import { CoffeeDetailView } from "@/components/coffees/CoffeeDetailView";
import { CommentList } from "@/components/coffees/CommentList";
import { AlsoLike } from "@/components/coffees/AlsoLike";
import { MoreFromShop } from "@/components/coffees/MoreFromShop";
import { SaveButton } from "@/components/coffees/SaveButton";
import { ErrorState } from "@/components/ErrorState";

type Params = Promise<{ id: string }>;

// Deduplicate the fetch between generateMetadata and the page render.
const loadCoffee = cache(async (id: string) =>
  isUUID(id) ? (await query(COFFEE_PAGE, { id, more: MORE_FROM_SHOP + 1, similar: SIMILAR_COFFEES })).coffee : null,
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
  const fromShop = moreFromShop(coffee.more.coffees.nodes, coffee.id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* Structured data for search engines. Public, published pages only (the
          draft preview never renders this page); serializeJsonLd escapes seller text. */}
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(
            coffeeJsonLd(
              { ...coffee, provenance: provenanceFacts(coffee), cup: cupScalesOf(coffee) },
              siteBase(process.env.SITE_URL),
            ),
          ) }}
      />
      <Link href="/coffees" className="text-sm font-medium text-ink underline-offset-4 hover:underline">
        {t(locale, "coffee.back")}
      </Link>

      <CoffeeDetailView
        coffee={coffee}
        locale={locale}
        actions={<SaveButton coffeeId={coffee.id} saveCount={coffee.saveCount} locale={locale} />}
      />

      <CommentList
        coffeeId={coffee.id}
        isPublished={coffee.isPublished}
        comments={coffee.comments} total={coffee.commentCount} locale={locale} />

      <MoreFromShop coffees={fromShop} total={coffee.more.coffees.total} shop={coffee.shop} locale={locale} />

      <AlsoLike coffees={alsoLike(coffee.similar, fromShop, coffee.id)} locale={locale} />
    </div>
  );
}
