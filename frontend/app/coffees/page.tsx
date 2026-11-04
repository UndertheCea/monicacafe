import type { Metadata } from "next";
import { COFFEES, FILTER_OPTIONS } from "@/lib/api";
import { PAGE_SIZE, parseCoffeeSearch, type SearchParams } from "@/lib/coffeeFilters";
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
  const { filter, page } = parseCoffeeSearch(sp);

  let data;
  try {
    const [options, list] = await Promise.all([
      query(FILTER_OPTIONS),
      query(COFFEES, { filter, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    ]);
    data = { options, list: list.coffees };
  } catch (err) {
    return <ErrorState locale={locale} error={err} />;
  }

  const { options, list } = data;
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-stone-900">{t(locale, "coffees.title")}</h1>
        <p className="mt-2 text-stone-600">{t(locale, "coffees.subtitle")}</p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[18rem_1fr]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <FilterSidebar
            locale={locale}
            filter={filter}
            origins={options.originCountries}
            varieties={options.coffeeVarieties}
            methods={options.processingMethods}
          />
        </aside>

        <section aria-live="polite">
          <p className="mb-4 text-sm text-stone-500">{t(locale, "coffees.count", { n: list.total })}</p>

          {list.nodes.length === 0 ? (
            <p className="rounded-2xl bg-white p-10 text-center text-stone-500 ring-1 ring-stone-200">
              {t(locale, "coffees.empty")}
            </p>
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
    </main>
  );
}
