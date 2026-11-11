import type { Metadata } from "next";
import Link from "next/link";
import { SHOPS } from "@/lib/api";
import { parsePage, type SearchParams } from "@/lib/coffeeFilters";
import { serverQuery } from "@/lib/serverQuery";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { listingCanonicalPath, listingRobots, shareMetadata } from "@/lib/seo";
import { siteBase } from "@/lib/sitemap";
import { ErrorState } from "@/components/ErrorState";
import { Pagination } from "@/components/Pagination";
import { ShopCard } from "@/components/shops/ShopCard";
import { ShopListSortForm } from "@/components/shops/ShopSortForm";
import { parseSearchParam } from "@/lib/coffeeQuery";
import { parseShopSortParam, shopListHref, shopSortForApi } from "@/lib/shopQuery";
import { Page } from "@/components/Page";

const SHOPS_PAGE_SIZE = 12;

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const [sp, locale] = await Promise.all([searchParams, getLocale()]);
  const title = t(locale, "shops.title");
  return {
    title,
    ...shareMetadata({
      base: siteBase(process.env.SITE_URL),
      path: listingCanonicalPath("/shops", parsePage(sp)),
      title,
      description: t(locale, "shops.subtitle"),
      images: [],
      locale,
    }),
    robots: listingRobots(parseSearchParam(sp.q)),
  };
}

export default async function ShopsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const locale = await getLocale();
  const page = parsePage(sp);
  const sort = parseShopSortParam(sp.sort);
  const q = parseSearchParam(sp.q);

  let shops;
  try {
    shops = (
      await serverQuery(SHOPS, {
        search: q,
        sort: shopSortForApi(sort),
        limit: SHOPS_PAGE_SIZE,
        offset: (page - 1) * SHOPS_PAGE_SIZE,
      })
    ).shops;
  } catch (err) {
    return <ErrorState locale={locale} error={err} />;
  }
  const pages = Math.max(1, Math.ceil(shops.total / SHOPS_PAGE_SIZE));

  return (
    <Page className="py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-ink">{t(locale, "shops.title")}</h1>
        <p className="mt-2 text-muted">{t(locale, "shops.subtitle")}</p>
      </header>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div aria-live="polite">
          {q && <h2 className="text-lg font-semibold text-ink">{t(locale, "shops.results", { q })}</h2>}
          <p className="text-sm text-muted">{t(locale, "shops.count", { n: shops.total })}</p>
        </div>
        {/* Hidden only while the platform has a single shop and nobody searched. */}
        {(shops.total > 1 || q) && <ShopListSortForm locale={locale} sort={sort} q={q} />}
      </div>

      {shops.nodes.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center text-muted ring-1 ring-line">
          <p>{q ? t(locale, "shops.emptySearch", { q }) : t(locale, "shops.empty")}</p>
          {q && (
            <Link
              href={shopListHref({ sort })}
              className="mt-4 inline-block text-sm font-semibold text-ink underline-offset-4 hover:underline"
            >
              {t(locale, "shops.clearSearch")}
            </Link>
          )}
        </div>
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
