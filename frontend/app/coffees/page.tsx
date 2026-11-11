import type { Metadata } from "next";
import { BROWSE_FILTER_OPTIONS, COFFEES } from "@/lib/api";
import Link from "next/link";
import { PAGE_SIZE, pageHref, parseCoffeeSearch, type SearchParams } from "@/lib/coffeeFilters";
import { clearFiltersHref, hasFiltersBesidesSearch, sortForApi } from "@/lib/coffeeQuery";
import { activeFilterCount, filterChips } from "@/lib/filterChips";
import { serverQuery } from "@/lib/serverQuery";
import { pick, t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { listingCanonicalPath, listingRobots, shareMetadata } from "@/lib/seo";
import { siteBase } from "@/lib/sitemap";
import { CoffeeCard } from "@/components/coffees/CoffeeCard";
import { FilterChips } from "@/components/coffees/FilterChips";
import { FilterPanel } from "@/components/coffees/FilterPanel";
import { FilterSidebar } from "@/components/coffees/FilterSidebar";
import { ErrorState } from "@/components/ErrorState";
import { Pagination } from "@/components/Pagination";
import { Page } from "@/components/Page";

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const [sp, locale] = await Promise.all([searchParams, getLocale()]);
  const { filter, page } = parseCoffeeSearch(sp);
  const title = t(locale, "coffees.title");
  return {
    title,
    ...shareMetadata({
      base: siteBase(process.env.SITE_URL),
      path: listingCanonicalPath("/coffees", page),
      title,
      description: t(locale, "coffees.subtitle"),
      images: [],
      locale,
    }),
    robots: listingRobots(filter.search),
  };
}

export default async function CoffeesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const locale = await getLocale();
  const { filter, sort, page } = parseCoffeeSearch(sp);

  let data;
  try {
    const [options, list] = await Promise.all([
      serverQuery(BROWSE_FILTER_OPTIONS),
      serverQuery(COFFEES, { filter, sort: sortForApi(sort), limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    ]);
    data = { options, list: list.coffees };
  } catch (err) {
    return <ErrorState locale={locale} error={err} />;
  }

  const { options, list } = data;
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const q = filter.search;
  const filtered = hasFiltersBesidesSearch(filter);
  const chips = filterChips(filter, sp, "/coffees", { search: true });
  const active = activeFilterCount(filter);
  const names = new Map<string, string>([
    ...options.originCountries.map((o) => [o.id, pick(locale, o.nameZh, o.nameEn)] as const),
    ...options.coffeeVarieties.map((v) => [v.id, v.name] as const),
    ...options.processingMethods.map((m) => [m.id, pick(locale, m.nameZh, m.nameEn)] as const),
  ]);

  return (
    <Page className="py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-ink">{t(locale, "coffees.title")}</h1>
        <p className="mt-2 text-muted">{t(locale, "coffees.subtitle")}</p>
      </header>

      {/* Sidebar from md (768px): tablets and half-width windows keep the desktop layout (#165). */}
      <div className="grid gap-8 md:grid-cols-[15rem_1fr] lg:grid-cols-[18rem_1fr]">
        <aside className="md:sticky md:top-20 md:self-start">
          <FilterPanel
            summary={active > 0 ? t(locale, "filter.toggleCount", { n: active }) : t(locale, "filter.title")}
            title={t(locale, "filter.title")}
            closeLabel={t(locale, "filter.close")}
          >
            <FilterSidebar
              locale={locale}
              filter={filter}
              sort={sort}
              origins={options.originCountries}
              varieties={options.coffeeVarieties}
              methods={options.processingMethods}
            />
          </FilterPanel>
        </aside>

        <section>
          {q && <h2 className="mb-1 text-lg font-semibold text-ink">{t(locale, "coffees.results", { q })}</h2>}
          <p aria-live="polite" className="mb-4 text-sm text-muted">{t(locale, "coffees.count", { n: list.total })}</p>
          <FilterChips locale={locale} chips={chips} names={names} clearHref={clearFiltersHref(q, sort)} />

          {list.nodes.length === 0 ? (
            <div className="rounded-2xl bg-white p-10 text-center text-muted ring-1 ring-line">
              <p>{q ? t(locale, "coffees.emptySearch", { q }) : t(locale, "coffees.empty")}</p>
              {(q || filtered) && (
                <div className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2">
                  {q && (
                    <Link
                      href={pageHref({ ...sp, q: undefined }, 1)}
                      className="text-sm font-semibold text-ink underline-offset-4 hover:underline"
                    >
                      {t(locale, "coffees.clearSearch")}
                    </Link>
                  )}
                  {filtered && (
                    <Link
                      href={clearFiltersHref(q, sort)}
                      className="text-sm font-semibold text-ink underline-offset-4 hover:underline"
                    >
                      {t(locale, "coffees.clearFilters")}
                    </Link>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {list.nodes.map((c) => (
                <CoffeeCard key={c.id} coffee={c} locale={locale} />
              ))}
            </div>
          )}

          <Pagination locale={locale} sp={sp} page={page} pages={pages} base="/coffees" />
        </section>
      </div>
    </Page>
  );
}
