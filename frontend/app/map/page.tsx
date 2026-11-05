import type { Metadata } from "next";
import Link from "next/link";
import { SHOPS_FOR_MAP, hasLocation } from "@/lib/api";
import { query } from "@/lib/graphql";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { ErrorState } from "@/components/ErrorState";
import { ShopMap } from "@/components/map/ShopMap";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: t(locale, "map.title"), description: t(locale, "map.subtitle") };
}

export default async function MapPage() {
  const locale = await getLocale();

  let pins;
  try {
    pins = (await query(SHOPS_FOR_MAP)).shopsForMap;
  } catch (err) {
    return <ErrorState locale={locale} error={err} />;
  }
  const located = pins.filter(hasLocation);
  const missing = pins.length - located.length;

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-stone-900">{t(locale, "map.title")}</h1>
        <p className="mt-2 text-stone-600">{t(locale, "map.subtitle")}</p>
      </header>

      <p className="mb-4 text-sm text-stone-500">
        {t(locale, "map.count", { n: located.length })}
        {missing > 0 && ` · ${t(locale, "map.noLocation", { n: missing })}`}
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <ShopMap
          pins={located}
          loadingLabel={t(locale, "map.loading")}
          attribution={t(locale, "map.attribution")}
          viewShopLabel={t(locale, "shops.view")}
        />

        {/* Server-rendered list: works without JS and is the accessible path to each shop. */}
        <section aria-labelledby="map-list" className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
          <h2 id="map-list" className="mb-3 text-sm font-semibold text-stone-900">
            {t(locale, "map.list")}
          </h2>
          {pins.length === 0 ? (
            <p className="text-sm text-stone-500">{t(locale, "map.empty")}</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {pins.map((p) => (
                <li key={p.id}>
                  <Link href={`/shops/${p.slug}`} className="block py-2 hover:text-amber-700">
                    <span className="block text-sm font-medium">{p.name}</span>
                    {p.city && <span className="block text-xs text-stone-500">{p.city}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
