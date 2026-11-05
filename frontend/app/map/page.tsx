import type { Metadata } from "next";
import Link from "next/link";
import { SHOPS_FOR_MAP, groupByCity, hasCoords } from "@/lib/api";
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
  const located = pins.filter(hasCoords).length;

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-stone-900">{t(locale, "map.title")}</h1>
        <p className="mt-2 text-stone-600">{t(locale, "map.subtitle")}</p>
      </header>
      <p className="mb-4 text-sm text-stone-500">{t(locale, "map.count", { n: located })}</p>

      <ShopMap
        pins={pins}
        ariaLabel={t(locale, "map.ariaLabel")}
        loadingLabel={t(locale, "map.loading")}
        failedLabel={t(locale, "map.loadFailed")}
      />

      {/* Text list: the accessible, no-JS equivalent of the map. */}
      <section className="mt-10" aria-labelledby="map-list">
        <h2 id="map-list" className="mb-4 text-xl font-bold text-stone-900">
          {t(locale, "map.listTitle")}
        </h2>
        {pins.length === 0 ? (
          <p className="rounded-2xl bg-white p-10 text-center text-stone-500 ring-1 ring-stone-200">
            {t(locale, "map.empty")}
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {groupByCity(pins).map(([city, list]) => (
              <div key={city} className="rounded-2xl bg-white p-5 ring-1 ring-stone-200">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-amber-700">{city}</h3>
                <ul className="space-y-2">
                  {list.map((p) => (
                    <li key={p.id} className="flex items-baseline justify-between gap-3">
                      <Link href={`/shops/${p.slug}`} className="font-medium text-stone-900 hover:text-amber-700">
                        {p.name}
                      </Link>
                      {!hasCoords(p) && (
                        <span className="shrink-0 text-xs text-stone-400">{t(locale, "map.noLocation")}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
