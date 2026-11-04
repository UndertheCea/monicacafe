import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { SHOP } from "@/lib/api";
import { PAGE_SIZE, parsePage, type SearchParams } from "@/lib/coffeeFilters";
import { query } from "@/lib/graphql";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { CoffeeCard } from "@/components/coffees/CoffeeCard";
import { ErrorState } from "@/components/ErrorState";
import { Pagination } from "@/components/Pagination";

type Params = Promise<{ slug: string }>;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const loadShop = cache(async (slug: string, page: number) =>
  SLUG_RE.test(slug)
    ? (await query(SHOP, { slug, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })).shop
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
    const shop = await loadShop(slug, parsePage(sp));
    if (!shop) return { title: t(locale, "shops.notFound") };
    return { title: shop.name, description: shop.description.slice(0, 160) };
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

  return (
    <main>
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
          </div>
        </div>

        {shop.description && (
          <p className="mt-6 max-w-3xl whitespace-pre-line leading-relaxed text-stone-700">{shop.description}</p>
        )}

        <section className="mt-10 pb-12" aria-labelledby="shop-coffees">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 id="shop-coffees" className="text-xl font-bold text-stone-900">
              {t(locale, "shops.coffees")}
            </h2>
            <span className="text-sm text-stone-500">{t(locale, "shops.coffeesCount", { n: shop.coffees.total })}</span>
          </div>

          {shop.coffees.nodes.length === 0 ? (
            <p className="rounded-2xl bg-white p-10 text-center text-stone-500 ring-1 ring-stone-200">
              {t(locale, "shops.noCoffees")}
            </p>
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
    </main>
  );
}
