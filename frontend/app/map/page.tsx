import type { Metadata } from "next";
import Link from "next/link";
import { SHOPS_FOR_MAP } from "@/lib/api";
import { partitionPins } from "@/lib/mapPins";
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
  const { placed, unplaced } = partitionPins(pins);

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-stone-900">{t(locale, "map.title")}</h1>
        <p className="mt-2 text-stone-600">{t(locale, "map.subtitle")}</p>
      </header>
      <p className="mb-4 text-sm text-stone-500">{t(locale, "map.count", { n: placed.length })}</p>

      {placed.length === 0 ? (
        <p className="rounded-2xl bg-white p-10 text-center text-stone-500 ring-1 ring-stone-200">
          {t(locale, "map.empty")}
        </p>
      ) : (
        <ShopMap pins={placed} locale={locale} />
      )}

      {unplaced.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold text-stone-900">{t(locale, "map.unplaced")}</h2>
          <ul className="flex flex-wrap gap-2">
            {unplaced.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/shops/${encodeURIComponent(p.slug)}`}
                  className="inline-block rounded-full bg-white px-4 py-1.5 text-sm text-stone-700 ring-1 ring-stone-200 hover:text-amber-700"
                >
                  {p.name}
                  {p.city && <span className="ml-1 text-stone-400">· {p.city}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
