import type { Metadata } from "next";
import Link from "next/link";
import { SHOPS_FOR_MAP, hasCoords } from "@/lib/api";
import { cityGroups } from "@/lib/mapList";
import { serverQuery } from "@/lib/serverQuery";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { shareMetadata } from "@/lib/seo";
import { siteBase } from "@/lib/sitemap";
import { ErrorState } from "@/components/ErrorState";
import { mapControlLabels } from "@/lib/mapControls";
import { ShopMap } from "@/components/map/ShopMap";
import { Page } from "@/components/Page";
import { Card, Label, PageTitle, SectionTitle } from "@/components/ui";
import { pluralKey } from "@/lib/plural";

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
        <PageTitle>{t(locale, "map.title")}</PageTitle>
        <p className="mt-2 text-muted">{t(locale, "map.subtitle")}</p>
      </header>
      <p className="mb-4 text-sm text-muted">{t(locale, pluralKey("map.count", located), { n: located })}</p>

      <ShopMap
        pins={pins}
        ariaLabel={t(locale, "map.ariaLabel")}
        loadingLabel={t(locale, "map.loading")}
        failedLabel={t(locale, "map.loadFailed")}
        twoFingersLabel={t(locale, "map.twoFingers")}
        controlLabels={mapControlLabels(locale)}
      />

      {/* Text list: the accessible, no-JS equivalent of the map. */}
      <section className="mt-10" aria-labelledby="map-list">
        <SectionTitle id="map-list" className="mb-4">
          {t(locale, "map.listTitle")}
        </SectionTitle>
        {pins.length === 0 ? (
          <Card as="p" className="p-10 text-center text-muted">
            {t(locale, "map.empty")}
          </Card>
        ) : (
          // grid-cols-1 + min-w-0: a long shop name must not stretch the column past the viewport (#294).
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {cityGroups(pins).map(({ city, count, shops, more }) => (
              <Card key={city} className="min-w-0 p-5">
                <Label as="h3" className="mb-3 text-ink!">
                  {city} <span className="font-normal text-muted">({count})</span>
                </Label>
                <ul className="space-y-2">
                  {shops.map((p) => (
                    <li key={p.id} className="min-w-0">
                      <Link href={`/shops/${p.slug}`} className="break-words font-medium text-ink hover:text-ink hover:underline underline-offset-4">
                        {p.name}
                      </Link>
                    </li>
                  ))}
                </ul>
                {more > 0 && (
                  <p className="mt-3 text-sm">
                    <Link href="/shops" className="text-muted underline-offset-4 hover:text-ink hover:underline">
                      {t(locale, pluralKey("map.moreShops", more), { n: more })}
                    </Link>
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>
    </Page>
  );
}
