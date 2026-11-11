import type { Metadata } from "next";
import Link from "next/link";
import { SHOPS_FOR_MAP, groupByCity, hasCoords } from "@/lib/api";
import { serverQuery } from "@/lib/serverQuery";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { shareMetadata } from "@/lib/seo";
import { siteBase } from "@/lib/sitemap";
import { ErrorState } from "@/components/ErrorState";
import { ShopMap } from "@/components/map/ShopMap";
import { Page } from "@/components/Page";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const title = t(locale, "map.title");
  return {
    title,
    ...shareMetadata({
      base: siteBase(process.env.SITE_URL),
      path: "/map",
      title,
      description: t(locale, "map.subtitle"),
      images: [],
      locale,
    }),
  };
}

export default async function MapPage() {
  const locale = await getLocale();

  let pins;
  try {
    pins = (await serverQuery(SHOPS_FOR_MAP)).shopsForMap;
  } catch (err) {
    return <ErrorState locale={locale} error={err} />;
  }
  const located = pins.filter(hasCoords).length;

  return (
    <Page className="py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-ink">{t(locale, "map.title")}</h1>
        <p className="mt-2 text-muted">{t(locale, "map.subtitle")}</p>
      </header>
      <p className="mb-4 text-sm text-muted">{t(locale, "map.count", { n: located })}</p>

      <ShopMap
        pins={pins}
        ariaLabel={t(locale, "map.ariaLabel")}
        loadingLabel={t(locale, "map.loading")}
        failedLabel={t(locale, "map.loadFailed")}
      />

      {/* Text list: the accessible, no-JS equivalent of the map. */}
      <section className="mt-10" aria-labelledby="map-list">
        <h2 id="map-list" className="mb-4 text-xl font-bold text-ink">
          {t(locale, "map.listTitle")}
        </h2>
        {pins.length === 0 ? (
          <p className="rounded-2xl bg-white p-10 text-center text-muted ring-1 ring-line">
            {t(locale, "map.empty")}
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {groupByCity(pins).map(([city, list]) => (
              <div key={city} className="rounded-2xl bg-white p-5 ring-1 ring-line">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink">{city}</h3>
                <ul className="space-y-2">
                  {list.map((p) => (
                    <li key={p.id} className="flex items-baseline justify-between gap-3">
                      <Link href={`/shops/${p.slug}`} className="font-medium text-ink hover:text-ink hover:underline underline-offset-4">
                        {p.name}
                      </Link>
                      {!hasCoords(p) && (
                        <span className="shrink-0 text-xs text-muted">{t(locale, "map.noLocation")}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </Page>
  );
}
