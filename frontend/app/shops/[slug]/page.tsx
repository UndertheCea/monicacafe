import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { SHOP } from "@/lib/api";
import { PAGE_SIZE, type SearchParams } from "@/lib/coffeeFilters";
import { serverQuery } from "@/lib/serverQuery";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { serializeJsonLd, shareMetadata, shopJsonLd } from "@/lib/seo";
import { siteBase } from "@/lib/sitemap";
import { parseShopPagePages, shopPageHref } from "@/lib/shopQuery";
import { CoffeeCard } from "@/components/coffees/CoffeeCard";
import { FollowButton } from "@/components/shops/FollowButton";
import { ErrorState } from "@/components/ErrorState";
import { Pagination } from "@/components/Pagination";
import { ShopLogo } from "@/components/shops/ShopLogo";
import { Page } from "@/components/Page";

type Params = Promise<{ slug: string }>;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// The shop page is the seller's storefront, not a search page (#158, #160),
// in the seller's lineup order (#161). Coffees with nothing to buy move to a
// sold-out archive below (#163). Old links with ?q / ?roast / ?sort … just
// show the full page; only ?page (lineup) and ?archive are read.
const loadShop = cache(async (slug: string, page: number, archive: number) =>
  SLUG_RE.test(slug)
    ? (
        await serverQuery(SHOP, {
          slug,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
          archiveOffset: (archive - 1) * PAGE_SIZE,
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
    const pages = parseShopPagePages(sp);
    const shop = await loadShop(slug, pages.page, pages.archive);
    if (!shop) return { title: t(locale, "shops.notFound") };
    return {
      title: shop.name,
      ...shareMetadata({
        base: siteBase(process.env.SITE_URL),
        path: shopPageHref(shop.slug, pages),
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
  const at = parseShopPagePages(sp);

  let shop;
  try {
    shop = await loadShop(slug, at.page, at.archive);
  } catch (err) {
    return <ErrorState locale={locale} error={err} />;
  }
  if (!shop) notFound();

  const pageCount = (total: number) => Math.max(1, Math.ceil(total / PAGE_SIZE));
  const archive = shop.archive;
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

      <Page>
        <div className={`relative flex flex-col gap-4 sm:flex-row ${shop.bannerUrl ? "-mt-12 sm:items-start" : "pt-10 sm:items-center"}`}>
          <ShopLogo name={shop.name} logoUrl={shop.logoUrl} size="lg" className="outline-4 outline-white" />
          <div className={shop.bannerUrl ? "sm:pt-14" : ""}>
            <h1 className="text-3xl font-bold text-ink">{shop.name}</h1>
            {shop.city && <p className="text-sm text-muted">{shop.city}</p>}
            <FollowButton shopId={shop.id} slug={shop.slug} followerCount={shop.followerCount} locale={locale} />
          </div>
        </div>

        {shop.description && (
          <p className="mt-6 max-w-3xl whitespace-pre-line leading-relaxed text-ink">{shop.description}</p>
        )}

        <section className="mt-10 pb-12" aria-labelledby="shop-coffees">
          <div className="mb-4 flex flex-wrap items-baseline gap-3">
            <h2 id="shop-coffees" className="text-xl font-bold text-ink">
              {t(locale, "shops.coffees")}
            </h2>
            <span className="text-sm text-muted">{t(locale, "shops.coffeesCount", { n: shop.coffees.total })}</span>
          </div>

          {shop.coffees.nodes.length === 0 ? (
            <div className="rounded-2xl bg-white p-10 text-center text-muted ring-1 ring-line">
              <p>{t(locale, archive.total > 0 ? "shops.allSoldOut" : "shops.noCoffees")}</p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shop.coffees.nodes.map((c) => (
                <CoffeeCard key={c.id} coffee={c} locale={locale} />
              ))}
            </div>
          )}

          <Pagination
            locale={locale}
            sp={{}}
            page={at.page}
            pages={pageCount(shop.coffees.total)}
            base={`/shops/${shop.slug}`}
            hrefFor={(p) => shopPageHref(shop.slug, { ...at, page: p })}
          />

          {archive.total > 0 && (
            <section id="archive" className="mt-14 scroll-mt-20 border-t border-line pt-8" aria-labelledby="shop-archive">
              <div className="mb-4 flex flex-wrap items-baseline gap-3">
                <h2 id="shop-archive" className="text-xl font-bold text-ink">
                  {t(locale, "shops.archive")}
                </h2>
                <span className="text-sm text-muted">{t(locale, "shops.coffeesCount", { n: archive.total })}</span>
              </div>
              {/* Muted, still black and white: greyscale photos and tiles, softer text. */}
              <div className="grid gap-5 opacity-70 grayscale sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {archive.nodes.map((c) => (
                  <CoffeeCard key={c.id} coffee={c} locale={locale} />
                ))}
              </div>
              <Pagination
                locale={locale}
                sp={{}}
                page={at.archive}
                pages={pageCount(archive.total)}
                base={`/shops/${shop.slug}`}
                hrefFor={(p) => shopPageHref(shop.slug, { ...at, archive: p }, "archive")}
              />
            </section>
          )}

          <Link href="/shops" className="mt-8 inline-block text-sm font-medium text-ink underline-offset-4 hover:underline">
            {t(locale, "shops.back")}
          </Link>
        </section>
      </Page>
    </div>
  );
}
