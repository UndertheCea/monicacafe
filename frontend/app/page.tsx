import Link from "next/link";
import { HOME } from "@/lib/api";
import { query } from "@/lib/graphql";
import { t, type Locale } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { CoffeeCard } from "@/components/coffees/CoffeeCard";
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
    <main>
      {/* Hero */}
      <section className="bg-stone-900 px-4 py-24 text-center md:py-32">
        <div className="mx-auto max-w-4xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-amber-400">
            {t(locale, "home.eyebrow")}
          </p>
          <h1 className="mb-6 text-4xl font-bold leading-tight text-white md:text-6xl">
            {t(locale, "home.title")}
            <span className="text-amber-300">{t(locale, "home.titleAccent")}</span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-stone-300">{t(locale, "home.lead")}</p>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/coffees"
              className="rounded-full bg-amber-400 px-8 py-4 font-semibold text-stone-900 transition hover:bg-amber-300"
            >
              {t(locale, "home.ctaCoffees")}
            </Link>
            <Link
              href="/map"
              className="rounded-full border border-white/30 px-8 py-4 font-semibold text-white transition hover:border-white/60"
            >
              {t(locale, "home.ctaMap")}
            </Link>
          </div>
        </div>
      </section>

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
          <p className="text-stone-500">{t(locale, "coffees.empty")}</p>
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
          <p className="text-stone-500">{t(locale, "shops.empty")}</p>
        )}
      </Section>

      {/* Why */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-stone-900">{t(locale, "home.whyTitle")}</h2>
          <div className="grid gap-8 md:grid-cols-3">
            {why.map((f) => (
              <div key={f.title} className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-stone-100">
                <span aria-hidden className="mb-4 block text-4xl">
                  {f.icon}
                </span>
                <h3 className="mb-3 text-lg font-semibold text-stone-900">{f.title}</h3>
                <p className="text-stone-500">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
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
    <section aria-labelledby={id} className={`px-4 py-16 ${tinted ? "bg-amber-50/60" : ""}`}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 id={id} className="text-2xl font-bold text-stone-900">
              {title}
            </h2>
            <p className="mt-1 text-stone-600">{subtitle}</p>
          </div>
          <Link href={href} className="shrink-0 text-sm font-medium text-amber-700 hover:underline">
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
    <p role="status" className="rounded-2xl bg-white p-8 text-center text-stone-500 ring-1 ring-stone-200">
      {t(locale, "home.unavailable")}
    </p>
  );
}
