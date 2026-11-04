import type { Metadata } from "next";
import Link from "next/link";
import { SHOPS_FOR_MAP, type ShopPin } from "@/lib/api";
import { query } from "@/lib/graphql";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { ErrorState } from "@/components/ErrorState";
import { ShopMap, type PlottablePin } from "@/components/map/ShopMap";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: t(locale, "map.title"), description: t(locale, "map.subtitle") };
}

function isPlottable(p: ShopPin): p is PlottablePin {
  return p.lat !== null && p.lng !== null;
}

export default async function MapPage() {
  const locale = await getLocale();

  let pins: ShopPin[];
  try {
    pins = (await query(SHOPS_FOR_MAP)).shopsForMap;
  } catch (err) {
    return <ErrorState locale={locale} error={err} />;
  }
  const plotted = pins.filter(isPlottable);
  const unplaced = pins.filter((p) => !isPlottable(p));

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-stone-900">{t(locale, "map.title")}</h1>
        <p className="mt-2 text-stone-600">{t(locale, "map.subtitle")}</p>
      </header>
      <p className="mb-4 text-sm text-stone-500">{t(locale, "map.count", { n: plotted.length })}</p>

      {plotted.length === 0 ? (
        <p className="rounded-2xl bg-white p-10 text-center text-stone-500 ring-1 ring-stone-200">
          {t(locale, "map.empty")}
        </p>
      ) : (
        <ShopMap
          pins={plotted}
          labels={{
            ariaLabel: t(locale, "map.ariaLabel"),
            loading: t(locale, "map.loading"),
            attribution: t(locale, "map.attribution"),
            listTitle: t(locale, "map.listTitle"),
            viewShop: t(locale, "shops.view"),
          }}
        />
      )}

      {unplaced.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold text-stone-900">{t(locale, "map.noLocation")}</h2>
          <ul className="flex flex-wrap gap-2">
            {unplaced.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/shops/${p.slug}`}
                  className="inline-block rounded-full bg-white px-3 py-1 text-sm text-stone-700 ring-1 ring-stone-200 hover:ring-amber-500"
                >
                  {p.name}
                  {p.city && <span className="text-stone-400"> · {p.city}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
