import Link from "next/link";
import { HOME } from "@/lib/api";
import { query } from "@/lib/graphql";
import { t, type Locale } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { CoffeeCard } from "@/components/coffees/CoffeeCard";
import { FollowingFeed } from "@/components/coffees/FollowingFeed";
import { ShopCard } from "@/components/shops/ShopCard";

const POPULAR_COUNT = 4;
const FEATURED_SHOPS = 3;

export default async function HomePage() {
  const locale = await getLocale();

  // The hero and feature grid are static; if the API is down the home page
  // still renders and the data sections show a short notice instead.
  const home = await query(HOME, { popular: POPULAR_COUNT, shops: FEATURED_SHOPS }).catch(() => null);

  const why = [
    { icon: "🏠", title: t(locale, "home.why1Title"), body: t(locale, "home.why1Body") },
    { icon: "🔎", title: t(locale, "home.why2Title"), body: t(locale, "home.why2Body") },
    { icon: "💬", title: t(locale, "home.why3Title"), body: t(locale, "home.why3Body") },
  ];

  return (
    <div>
      {/* Hero */}
      <section className="border-b border-line px-4 py-24 text-center md:py-32">
        <div className="mx-auto max-w-4xl">
          <p className="label-caps mb-6 text-muted">
            {t(locale, "home.eyebrow")}
          </p>
          <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight text-ink md:text-6xl">
            {t(locale, "home.title")}
            <span className="italic">{t(locale, "home.titleAccent")}</span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-muted">{t(locale, "home.lead")}</p>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/coffees"
              className="rounded-full bg-ink px-8 py-4 font-semibold text-white transition hover:bg-neutral-700"
            >
              {t(locale, "home.ctaCoffees")}
            </Link>
            <Link
              href="/map"
              className="rounded-full border border-ink px-8 py-4 font-semibold text-ink transition hover:bg-neutral-100"
            >
              {t(locale, "home.ctaMap")}
            </Link>
          </div>
        </div>
      </section>

      {/* Signed-in only: fetched client-side with the viewer's token */}
      <FollowingFeed locale={locale} />

      {/* Popular coffees */}
      <Section
        locale={locale}
        id="popular"
        title={t(locale, "home.popular")}
        subtitle={t(locale, "home.popularSub")}
        href="/coffees"
      >
        {home === null ? (
          <Unavailable locale={locale} />
        ) : home.popularCoffees.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {home.popularCoffees.map((c) => (
              <CoffeeCard key={c.id} coffee={c} locale={locale} />
            ))}
          </div>
        ) : (
          <p className="text-neutral-500">{t(locale, "coffees.empty")}</p>
        )}
      </Section>

      {/* Featured shops */}
      <Section
        locale={locale}
        id="shops"
        title={t(locale, "home.shops")}
        subtitle={t(locale, "home.shopsSub")}
        href="/shops"
        tinted
      >
        {home === null ? (
          <Unavailable locale={locale} />
        ) : home.shops.nodes.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {home.shops.nodes.map((s) => (
              <ShopCard key={s.id} shop={s} locale={locale} />
            ))}
          </div>
        ) : (
          <p className="text-neutral-500">{t(locale, "shops.empty")}</p>
        )}
      </Section>

      {/* Why */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-ink">{t(locale, "home.whyTitle")}</h2>
          <div className="grid gap-8 md:grid-cols-3">
            {why.map((f) => (
              <div key={f.title} className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-neutral-100">
                <span aria-hidden className="mb-4 block text-4xl">
                  {f.icon}
                </span>
                <h3 className="mb-3 text-lg font-semibold text-ink">{f.title}</h3>
                <p className="text-neutral-500">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function Section({
  locale,
  id,
  title,
  subtitle,
  href,
  tinted,
  children,
}: {
  locale: Locale;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  tinted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={`px-4 py-16 ${tinted ? "border-y border-line" : ""}`}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 id={id} className="text-2xl font-bold text-ink">
              {title}
            </h2>
            <p className="mt-1 text-neutral-600">{subtitle}</p>
          </div>
          <Link href={href} className="shrink-0 text-sm font-medium text-ink underline-offset-4 hover:underline">
            {t(locale, "home.seeAll")}
          </Link>
        </div>
        {children}
      </div>
    </section>
  );
}

function Unavailable({ locale }: { locale: Locale }) {
  return (
    <p role="status" className="rounded-2xl bg-white p-8 text-center text-neutral-500 ring-1 ring-neutral-200">
      {t(locale, "home.unavailable")}
    </p>
  );
}
