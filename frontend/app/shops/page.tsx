import { pluralKey } from "@/lib/plural";
import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { SHOPS } from "@/lib/api";
import { pageHref, parsePage, type SearchParams } from "@/lib/coffeeFilters";
import { pastLastPage } from "@/lib/pagination";
import { PastLastPage } from "@/components/PastLastPage";
import { serverQuery } from "@/lib/serverQuery";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { listingCanonicalPath, listingRobots, shareMetadata } from "@/lib/seo";
import { siteBase } from "@/lib/sitemap";
import { ErrorState } from "@/components/ErrorState";
import { Pagination } from "@/components/Pagination";
import { ShopCard } from "@/components/shops/ShopCard";
import { ShopListSortForm } from "@/components/shops/ShopSortForm";
import { FilterChips } from "@/components/coffees/FilterChips";
import { hrefWithout } from "@/lib/filterChips";
import { parseSearchParam } from "@/lib/coffeeQuery";
import { parseShopSortParam, shopListHref, shopSortForApi } from "@/lib/shopQuery";
import { Page } from "@/components/Page";
import { Card, PageTitle, SectionTitle } from "@/components/ui";

const SHOPS_PAGE_SIZE = 12;

// One load per request for generateMetadata and the page, so the metadata can
// mark a past-the-end ?page= noindex (#402).
const loadShops = cache(
  async (search: string | undefined, city: string | undefined, sort: ReturnType<typeof parseShopSortParam>, page: number) =>
    (
      await serverQuery(SHOPS, {
        search,
        city,
        sort: shopSortForApi(sort),
        limit: SHOPS_PAGE_SIZE,
        offset: (page - 1) * SHOPS_PAGE_SIZE,
      })
    ).shops,
);

function parseShopList(sp: SearchParams) {
  return {
    page: parsePage(sp),
    sort: parseShopSortParam(sp.sort),
    q: parseSearchParam(sp.q),
    city: parseSearchParam(sp.city),
  };
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const [sp, locale] = await Promise.all([searchParams, getLocale()]);
  const { page, sort, q, city } = parseShopList(sp);
  const title = t(locale, "shops.title");
  let pastEnd = false;
  let failed = false;
  try {
    pastEnd = pastLastPage((await loadShops(q, city, sort, page)).total, page, SHOPS_PAGE_SIZE);
  } catch {
    // The page shows its error panel: keep it out of the index (#426).
    failed = true;
  }
  return {
    title,
    ...shareMetadata({
      base: siteBase(process.env.SITE_URL),
      path: listingCanonicalPath("/shops", page),
      title,
      description: t(locale, "shops.subtitle"),
      images: [],
      locale,
    }),
    robots: listingRobots(q ?? city, pastEnd, failed),
  };
}

export default async function ShopsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const locale = await getLocale();
  const { page, sort, q, city } = parseShopList(sp);

  let shops;
  try {
    shops = await loadShops(q, city, sort, page);
  } catch (err) {
    return <ErrorState locale={locale} error={err} />;
  }
  const pages = Math.max(1, Math.ceil(shops.total / SHOPS_PAGE_SIZE));

  return (
    <Page className="py-10">
      <header className="mb-8">
        <PageTitle>{t(locale, "shops.title")}</PageTitle>
        <p className="mt-2 text-muted">{t(locale, "shops.subtitle")}</p>
      </header>
      {city && (
        <FilterChips
          locale={locale}
          chips={[{ kind: "city", name: city, href: hrefWithout("/shops", sp, ["city"]) }]}
          clearHref={shopListHref({ q, sort })}
        />
      )}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div aria-live="polite">
          {q && <SectionTitle>{t(locale, "shops.results", { q })}</SectionTitle>}
          <p className="text-sm text-muted">{t(locale, pluralKey("shops.count", shops.total), { n: shops.total })}</p>
        </div>
        {/* Hidden only while the platform has a single shop and nobody searched. */}
        {(shops.total > 1 || q || city) && <ShopListSortForm locale={locale} sort={sort} q={q} city={city} />}
      </div>

      {shops.nodes.length === 0 && pastLastPage(shops.total, page, SHOPS_PAGE_SIZE) ? (
        <PastLastPage locale={locale} href={pageHref(sp, 1, "/shops")} />
      ) : shops.nodes.length === 0 ? (
        <Card className="p-10 text-center text-muted">
          <p>{q ? t(locale, "shops.emptySearch", { q }) : city ? t(locale, "shops.emptyCity", { city }) : t(locale, "shops.empty")}</p>
          {q && (
            <Link
              href={shopListHref({ sort, city })}
              className="mt-4 inline-block text-sm font-semibold text-ink underline-offset-4 hover:underline"
            >
              {t(locale, "shops.clearSearch")}
            </Link>
          )}
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shops.nodes.map((s) => (
            <ShopCard key={s.id} shop={s} locale={locale} />
          ))}
        </div>
      )}

      <Pagination locale={locale} sp={sp} page={page} pages={pages} base="/shops" />
    </Page>
  );
}
