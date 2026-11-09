import type { Metadata } from "next";
import { COFFEES, FILTER_OPTIONS } from "@/lib/api";
import Link from "next/link";
import { PAGE_SIZE, pageHref, parseCoffeeSearch, type SearchParams } from "@/lib/coffeeFilters";
import { clearFiltersHref, hasFiltersBesidesSearch, sortForApi } from "@/lib/coffeeQuery";
import { query } from "@/lib/graphql";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { CoffeeCard } from "@/components/coffees/CoffeeCard";
import { FilterSidebar } from "@/components/coffees/FilterSidebar";
import { ErrorState } from "@/components/ErrorState";
import { Pagination } from "@/components/Pagination";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: t(locale, "coffees.title"), description: t(locale, "coffees.subtitle") };
}

export default async function CoffeesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const locale = await getLocale();
  const { filter, sort, page } = parseCoffeeSearch(sp);

  let data;
  try {
    const [options, list] = await Promise.all([
      query(FILTER_OPTIONS),
      query(COFFEES, { filter, sort: sortForApi(sort), limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    ]);
    data = { options, list: list.coffees };
  } catch (err) {
    return <ErrorState locale={locale} error={err} />;
  }

  const { options, list } = data;
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const q = filter.search;
  const filtered = hasFiltersBesidesSearch(filter);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-ink">{t(locale, "coffees.title")}</h1>
        <p className="mt-2 text-neutral-600">{t(locale, "coffees.subtitle")}</p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[18rem_1fr]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <FilterSidebar
            locale={locale}
            filter={filter}
            sort={sort}
            origins={options.originCountries}
            varieties={options.coffeeVarieties}
            methods={options.processingMethods}
          />
        </aside>

        <section aria-live="polite">
          {q && <h2 className="mb-1 text-lg font-semibold text-ink">{t(locale, "coffees.results", { q })}</h2>}
          <p className="mb-4 text-sm text-neutral-500">{t(locale, "coffees.count", { n: list.total })}</p>

          {list.nodes.length === 0 ? (
            <div className="rounded-2xl bg-white p-10 text-center text-neutral-500 ring-1 ring-neutral-200">
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
    </div>
  );
}
