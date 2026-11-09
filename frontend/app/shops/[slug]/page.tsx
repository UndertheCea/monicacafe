import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { SHOP } from "@/lib/api";
import { PAGE_SIZE, parsePage, type SearchParams } from "@/lib/coffeeFilters";
import { query } from "@/lib/graphql";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { serializeJsonLd, shareMetadata, shopJsonLd } from "@/lib/seo";
import { siteBase } from "@/lib/sitemap";
import { CoffeeCard } from "@/components/coffees/CoffeeCard";
import { FollowButton } from "@/components/shops/FollowButton";
import { ErrorState } from "@/components/ErrorState";
import { Pagination } from "@/components/Pagination";
import { ShopLogo } from "@/components/shops/ShopLogo";

type Params = Promise<{ slug: string }>;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// The shop page is the seller's storefront, not a search page (#158, #160),
// in the seller's lineup order (Shop.coffees defaults to SHOP_ORDER, #161):
// no buyer search, filters or sort. Old links with ?q / ?roast / ?sort … just
// show the full lineup; only ?page is read.
const loadShop = cache(async (slug: string, page: number) =>
  SLUG_RE.test(slug)
    ? (
        await query(SHOP, {
          slug,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        })
      ).shop
    : null,
);

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const [{ slug }, sp, locale] = await Promise.all([params, searchParams, getLocale()]);
  try {
    const page = parsePage(sp);
    const shop = await loadShop(slug, page);
    if (!shop) return { title: t(locale, "shops.notFound") };
    return {
      title: shop.name,
      ...shareMetadata({
        base: siteBase(process.env.SITE_URL),
        path: `/shops/${shop.slug}${page > 1 ? `?page=${page}` : ""}`,
        title: shop.name,
        description: shop.description,
        images: [shop.bannerUrl, shop.logoUrl],
        locale,
      }),
    };
  } catch {
    return { title: t(locale, "shops.title") };
  }
}

export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<SearchParams>;
}) {
  const [{ slug }, sp, locale] = await Promise.all([params, searchParams, getLocale()]);
  const page = parsePage(sp);

  let shop;
  try {
    shop = await loadShop(slug, page);
  } catch (err) {
    return <ErrorState locale={locale} error={err} />;
  }
  if (!shop) notFound();

  const pages = Math.max(1, Math.ceil(shop.coffees.total / PAGE_SIZE));
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const jsonLd = shopJsonLd(shop, shop.coffees.nodes, siteBase(process.env.SITE_URL));

  return (
    <div>
      {/* Structured data (anonymous fetch: published coffees only); serializeJsonLd escapes seller text. */}
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      {/* No banner: no block at all, just white space (#112). */}
      {shop.bannerUrl && (
        <div className="relative h-48 border-b border-line md:h-64">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shop.bannerUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4">
        <div className={`relative flex flex-col gap-4 sm:flex-row ${shop.bannerUrl ? "-mt-12 sm:items-start" : "pt-10 sm:items-center"}`}>
          <ShopLogo name={shop.name} logoUrl={shop.logoUrl} size="lg" className="outline-4 outline-paper" />
          <div className={shop.bannerUrl ? "sm:pt-14" : ""}>
            <h1 className="text-3xl font-bold text-ink">{shop.name}</h1>
            {shop.city && <p className="text-sm text-neutral-500">{shop.city}</p>}
            <FollowButton shopId={shop.id} slug={shop.slug} followerCount={shop.followerCount} locale={locale} />
          </div>
        </div>

        {shop.description && (
          <p className="mt-6 max-w-3xl whitespace-pre-line leading-relaxed text-neutral-700">{shop.description}</p>
        )}

        <section className="mt-10 pb-12" aria-labelledby="shop-coffees">
          <div className="mb-4 flex flex-wrap items-baseline gap-3">
            <h2 id="shop-coffees" className="text-xl font-bold text-ink">
              {t(locale, "shops.coffees")}
            </h2>
            <span className="text-sm text-neutral-500">{t(locale, "shops.coffeesCount", { n: shop.coffees.total })}</span>
          </div>

          {shop.coffees.nodes.length === 0 ? (
            <div className="rounded-2xl bg-white p-10 text-center text-neutral-500 ring-1 ring-neutral-200">
              <p>{t(locale, "shops.noCoffees")}</p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shop.coffees.nodes.map((c) => (
                <CoffeeCard key={c.id} coffee={c} locale={locale} />
              ))}
            </div>
          )}

          <Pagination locale={locale} sp={{}} page={page} pages={pages} base={`/shops/${shop.slug}`} />

          <Link href="/shops" className="mt-8 inline-block text-sm font-medium text-ink underline-offset-4 hover:underline">
            {t(locale, "shops.back")}
          </Link>
        </section>
      </div>
    </div>
  );
}
