import type { Metadata } from "next";
import { SHOPS_FOR_MAP } from "@/lib/api";
import { query } from "@/lib/graphql";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { ErrorState } from "@/components/ErrorState";
import { MapExplorer } from "@/components/map/MapExplorer";
import type { MapPin } from "@/components/map/ShopMap";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: t(locale, "map.title"), description: t(locale, "map.subtitle") };
}

export default async function MapPage() {
  const locale = await getLocale();

  let pins: MapPin[];
  try {
    const { shopsForMap } = await query(SHOPS_FOR_MAP);
    // The API only returns pinnable shops, but keep the type narrowing honest.
    pins = shopsForMap.flatMap((s) =>
      s.lat != null && s.lng != null ? [{ slug: s.slug, name: s.name, city: s.city, lat: s.lat, lng: s.lng }] : [],
    );
  } catch (err) {
    return <ErrorState locale={locale} error={err} />;
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-stone-900">{t(locale, "map.title")}</h1>
        <p className="mt-2 text-stone-600">{t(locale, "map.subtitle")}</p>
      </header>

      {pins.length === 0 ? (
        <p className="rounded-2xl bg-white p-10 text-center text-stone-500 ring-1 ring-stone-200">
          {t(locale, "map.empty")}
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm text-stone-500">{t(locale, "map.count", { n: pins.length })}</p>
          <MapExplorer
            pins={pins}
            labels={{
              list: t(locale, "map.listTitle"),
              view: t(locale, "map.viewShop"),
              aria: t(locale, "map.ariaLabel"),
              loading: t(locale, "map.loading"),
            }}
          />
        </>
      )}
    </main>
  );
}
