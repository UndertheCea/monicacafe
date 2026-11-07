import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { SHOP } from "@/lib/api";
import { PAGE_SIZE, parsePage, type SearchParams } from "@/lib/coffeeFilters";
import {
  parseRoastParam,
  parseSearchParam,
  parseSortParam,
  shopCoffeesHref,
  sortForApi,
  type RoastLevel,
  type SortParam,
} from "@/lib/coffeeQuery";
import { query } from "@/lib/graphql";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { serializeJsonLd, shareMetadata, shopJsonLd } from "@/lib/seo";
import { siteBase } from "@/lib/sitemap";
import { CoffeeCard } from "@/components/coffees/CoffeeCard";
import { FollowButton } from "@/components/shops/FollowButton";
import { ShopCoffeesForm } from "@/components/shops/ShopSortForm";
import { ErrorState } from "@/components/ErrorState";
import { Pagination } from "@/components/Pagination";

type Params = Promise<{ slug: string }>;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Primitive arguments only: cache() matches calls by argument identity.
const loadShop = cache(async (slug: string, page: number, sort: SortParam, q?: string, roast?: RoastLevel) =>
  SLUG_RE.test(slug)
    ? (
        await query(SHOP, {
          slug,
          filter: { ...(q ? { search: q } : {}), ...(roast ? { roastLevel: roast } : {}) },
          sort: sortForApi(sort),
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        })
      ).shop
    : null,
);

/** The shop page's list options from the URL (same parsing as /coffees). */
function listOptions(sp: SearchParams) {
  return { page: parsePage(sp), sort: parseSortParam(sp.sort), q: parseSearchParam(sp.q), roast: parseRoastParam(sp.roast) };
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const [{ slug }, sp, locale] = await Promise.all([params, searchParams, getLocale()]);
  try {
    const { page, sort, q, roast } = listOptions(sp);
    const shop = await loadShop(slug, page, sort, q, roast);
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
  const { page, sort, q, roast } = listOptions(sp);
  const filtering = Boolean(q || roast);

  let shop;
  try {
    shop = await loadShop(slug, page, sort, q, roast);
  } catch (err) {
    return <ErrorState locale={locale} error={err} />;
  }
  if (!shop) notFound();

  const pages = Math.max(1, Math.ceil(shop.coffees.total / PAGE_SIZE));
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  // A filtered list isn't the shop's catalogue, so it's left out there.
  const jsonLd = shopJsonLd(shop, filtering ? [] : shop.coffees.nodes, siteBase(process.env.SITE_URL));

  return (
    <div>
      {/* Structured data (anonymous fetch: published coffees only); serializeJsonLd escapes seller text. */}
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <div className="relative h-48 bg-gradient-to-br from-stone-900 via-stone-800 to-amber-800 md:h-64">
        {shop.bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shop.bannerUrl} alt="" className="h-full w-full object-cover opacity-80" />
        )}
      </div>

      <div className="mx-auto max-w-7xl px-4">
        <div className="relative -mt-12 flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full bg-amber-100 text-4xl ring-4 ring-white">
            {shop.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shop.logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span aria-hidden>☕</span>
            )}
          </div>
          <div className="sm:pt-14">
            <h1 className="text-3xl font-bold text-stone-900">{shop.name}</h1>
            {shop.city && <p className="text-sm text-stone-500">{shop.city}</p>}
            <FollowButton shopId={shop.id} slug={shop.slug} followerCount={shop.followerCount} locale={locale} />
          </div>
        </div>

        {shop.description && (
          <p className="mt-6 max-w-3xl whitespace-pre-line leading-relaxed text-stone-700">{shop.description}</p>
        )}

        <section className="mt-10 pb-12" aria-labelledby="shop-coffees">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <h2 id="shop-coffees" className="text-xl font-bold text-stone-900">
                {t(locale, "shops.coffees")}
              </h2>
              <span className="text-sm text-stone-500">{t(locale, "shops.coffeesCount", { n: shop.coffees.total })}</span>
            </div>
            {(shop.coffeeCount > 1 || filtering) && (
              <ShopCoffeesForm locale={locale} sort={sort} q={q} roast={roast} action={`/shops/${shop.slug}`} />
            )}
          </div>
          {q && (
            <p className="mb-4 text-sm font-semibold text-stone-900" aria-live="polite">
              {t(locale, "shops.coffeeResults", { q })}
            </p>
          )}

          {shop.coffees.nodes.length === 0 ? (
            <div className="rounded-2xl bg-white p-10 text-center text-stone-500 ring-1 ring-stone-200">
              <p>{filtering ? t(locale, "shops.noMatches") : t(locale, "shops.noCoffees")}</p>
              {filtering && (
                <Link
                  href={shopCoffeesHref(shop.slug, { sort })}
                  className="mt-4 inline-block text-sm font-semibold text-amber-700 hover:underline"
                >
                  {t(locale, "shops.clearFilters")}
                </Link>
              )}
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shop.coffees.nodes.map((c) => (
                <CoffeeCard key={c.id} coffee={c} locale={locale} />
              ))}
            </div>
          )}

          <Pagination locale={locale} sp={sp} page={page} pages={pages} base={`/shops/${shop.slug}`} />

          <Link href="/shops" className="mt-8 inline-block text-sm font-medium text-amber-700 hover:underline">
            {t(locale, "shops.back")}
          </Link>
        </section>
      </div>
    </div>
  );
}
