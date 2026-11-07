import type { Metadata } from "next";
import Link from "next/link";
import { SHOPS } from "@/lib/api";
import { parsePage, type SearchParams } from "@/lib/coffeeFilters";
import { query } from "@/lib/graphql";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { ErrorState } from "@/components/ErrorState";
import { Pagination } from "@/components/Pagination";
import { ShopCard } from "@/components/shops/ShopCard";
import { ShopListSortForm } from "@/components/shops/ShopSortForm";
import { parseSearchParam } from "@/lib/coffeeQuery";
import { parseShopSortParam, shopListHref, shopSortForApi } from "@/lib/shopQuery";

const SHOPS_PAGE_SIZE = 12;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: t(locale, "shops.title"), description: t(locale, "shops.subtitle") };
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
      await query(SHOPS, {
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
    <div className="mx-auto max-w-7xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-stone-900">{t(locale, "shops.title")}</h1>
        <p className="mt-2 text-stone-600">{t(locale, "shops.subtitle")}</p>
      </header>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div aria-live="polite">
          {q && <h2 className="text-lg font-semibold text-stone-900">{t(locale, "shops.results", { q })}</h2>}
          <p className="text-sm text-stone-500">{t(locale, "shops.count", { n: shops.total })}</p>
        </div>
        {/* Hidden only while the platform has a single shop and nobody searched. */}
        {(shops.total > 1 || q) && <ShopListSortForm locale={locale} sort={sort} q={q} />}
      </div>

      {shops.nodes.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center text-stone-500 ring-1 ring-stone-200">
          <p>{q ? t(locale, "shops.emptySearch", { q }) : t(locale, "shops.empty")}</p>
          {q && (
            <Link
              href={shopListHref({ sort })}
              className="mt-4 inline-block text-sm font-semibold text-amber-700 hover:underline"
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
    </div>
  );
}
