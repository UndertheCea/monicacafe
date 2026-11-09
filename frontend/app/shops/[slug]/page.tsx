import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { SHOP, type CoffeeFilter } from "@/lib/api";
import { PAGE_SIZE, parsePage, type SearchParams } from "@/lib/coffeeFilters";
import {
  cupFilter,
  parseBrewParam,
  parseHarvestParam,
  parseAcidityParam,
  parseBodyParam,
  parseRoastParam,
  parseSearchParam,
  parseSortParam,
  parseSweetParam,
  recentHarvestFrom,
  shopCoffeesHref,
  sortForApi,
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
import { ShopLogo } from "@/components/shops/ShopLogo";

type Params = Promise<{ slug: string }>;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Primitive arguments only: cache() matches calls by argument identity, so the
// filter travels as JSON (shopFilter builds it with a stable key order).
const loadShop = cache(async (slug: string, page: number, sort: SortParam, filterJson: string) =>
  SLUG_RE.test(slug)
    ? (
        await query(SHOP, {
          slug,
          filter: JSON.parse(filterJson) as CoffeeFilter,
          sort: sortForApi(sort),
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        })
      ).shop
    : null,
);

/** The shop page's list options from the URL (same parsing as /coffees). */
function listOptions(sp: SearchParams) {
  return {
    page: parsePage(sp),
    sort: parseSortParam(sp.sort),
    q: parseSearchParam(sp.q),
    roast: parseRoastParam(sp.roast),
    brew: parseBrewParam(sp.brew),
    harvest: parseHarvestParam(sp.harvest),
    lowAcid: parseAcidityParam(sp.acidity),
    sweet: parseSweetParam(sp.sweet),
    body: parseBodyParam(sp.body),
  };
}

/** The API filter for the shop page's options (blank ones left out). */
function shopFilter(o: ReturnType<typeof listOptions>): CoffeeFilter {
  return {
    ...(o.q ? { search: o.q } : {}),
    ...(o.roast ? { roastLevel: o.roast } : {}),
    ...(o.brew ? { brewMethod: o.brew } : {}),
    ...(o.harvest ? { minHarvestYear: recentHarvestFrom() } : {}),
    ...cupFilter(o),
  };
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
    const opts = listOptions(sp);
    const shop = await loadShop(slug, opts.page, opts.sort, JSON.stringify(shopFilter(opts)));
    if (!shop) return { title: t(locale, "shops.notFound") };
    return {
      title: shop.name,
      ...shareMetadata({
        base: siteBase(process.env.SITE_URL),
        path: `/shops/${shop.slug}${opts.page > 1 ? `?page=${opts.page}` : ""}`,
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
  const opts = listOptions(sp);
  const { page, sort, q, roast, brew, harvest, lowAcid, sweet, body } = opts;
  const filter = shopFilter(opts);
  const filtering = Object.keys(filter).length > 0;

  let shop;
  try {
    shop = await loadShop(slug, page, sort, JSON.stringify(filter));
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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <h2 id="shop-coffees" className="text-xl font-bold text-ink">
                {t(locale, "shops.coffees")}
              </h2>
              <span className="text-sm text-neutral-500">{t(locale, "shops.coffeesCount", { n: shop.coffees.total })}</span>
            </div>
            {(shop.coffeeCount > 1 || filtering) && (
              <ShopCoffeesForm
                locale={locale}
                sort={sort}
                q={q}
                roast={roast}
                brew={brew}
                harvest={harvest}
                lowAcid={lowAcid}
                sweet={sweet}
                body={body}
                action={`/shops/${shop.slug}`}
              />
            )}
          </div>
          {q && (
            <p className="mb-4 text-sm font-semibold text-ink" aria-live="polite">
              {t(locale, "shops.coffeeResults", { q })}
            </p>
          )}

          {shop.coffees.nodes.length === 0 ? (
            <div className="rounded-2xl bg-white p-10 text-center text-neutral-500 ring-1 ring-neutral-200">
              <p>{filtering ? t(locale, "shops.noMatches") : t(locale, "shops.noCoffees")}</p>
              {filtering && (
                <Link
                  href={shopCoffeesHref(shop.slug, { sort })}
                  className="mt-4 inline-block text-sm font-semibold text-ink underline-offset-4 hover:underline"
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

          <Link href="/shops" className="mt-8 inline-block text-sm font-medium text-ink underline-offset-4 hover:underline">
            {t(locale, "shops.back")}
          </Link>
        </section>
      </div>
    </div>
  );
}
