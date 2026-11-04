import Link from "next/link";
import { POPULAR_COFFEES, SHOPS } from "@/lib/api";
import { query } from "@/lib/graphql";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { CoffeeCard } from "@/components/coffees/CoffeeCard";
import { ShopCard } from "@/components/shops/ShopCard";

const POPULAR_LIMIT = 4;
const FEATURED_SHOPS_LIMIT = 3;

const FEATURES: { icon: string; title: MessageKey; body: MessageKey }[] = [
  { icon: "🫘", title: "home.feature1Title", body: "home.feature1Body" },
  { icon: "🔎", title: "home.feature2Title", body: "home.feature2Body" },
  { icon: "💬", title: "home.feature3Title", body: "home.feature3Body" },
];

export default async function HomePage() {
  const locale = await getLocale();

  // Each section fails independently: the hero always renders even if the API is down.
  const [popular, shops] = await Promise.allSettled([
    query(POPULAR_COFFEES, { limit: POPULAR_LIMIT }),
    query(SHOPS, { limit: FEATURED_SHOPS_LIMIT }),
  ]);

  return (
    <main>
      {/* Hero */}
      <section className="bg-stone-900 px-4 py-24 text-center md:py-32">
        <div className="mx-auto max-w-4xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-amber-400">
            {t(locale, "home.eyebrow")}
          </p>
          <h1 className="mb-6 text-4xl font-bold leading-tight text-white md:text-6xl">
            {t(locale, "home.title")} <span className="text-amber-300">{t(locale, "home.titleAccent")}</span>
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
        title="home.popular"
        body="home.popularBody"
        href="/coffees"
      >
        {popular.status === "rejected" ? (
          <Unavailable locale={locale} />
        ) : popular.value.popularCoffees.length === 0 ? (
          <Empty>{t(locale, "home.emptyCoffees")}</Empty>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {popular.value.popularCoffees.map((c) => (
              <CoffeeCard key={c.id} coffee={c} locale={locale} />
            ))}
          </div>
        )}
      </Section>

      {/* Featured shops */}
      <Section
        locale={locale}
        title="home.featuredShops"
        body="home.featuredShopsBody"
        href="/shops"
        className="bg-white"
      >
        {shops.status === "rejected" ? (
          <Unavailable locale={locale} />
        ) : shops.value.shops.nodes.length === 0 ? (
          <Empty>{t(locale, "shops.empty")}</Empty>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {shops.value.shops.nodes.map((s) => (
              <ShopCard key={s.id} shop={s} locale={locale} />
            ))}
          </div>
        )}
      </Section>

      {/* Why MONI CAFE */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-stone-900">{t(locale, "home.why")}</h2>
          <div className="grid gap-8 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-stone-100">
                <span aria-hidden className="mb-4 block text-4xl">
                  {f.icon}
                </span>
                <h3 className="mb-3 text-lg font-semibold text-stone-900">{t(locale, f.title)}</h3>
                <p className="text-stone-500">{t(locale, f.body)}</p>
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
  title,
  body,
  href,
  className = "",
  children,
}: {
  locale: Locale;
  title: MessageKey;
  body: MessageKey;
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`px-4 py-16 ${className}`}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-stone-900">{t(locale, title)}</h2>
            <p className="mt-1 text-stone-600">{t(locale, body)}</p>
          </div>
          <Link href={href} className="text-sm font-medium text-amber-700 hover:underline">
            {t(locale, "home.seeAll")}
          </Link>
        </div>
        {children}
      </div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-white p-10 text-center text-stone-500 ring-1 ring-stone-200">{children}</p>;
}

function Unavailable({ locale }: { locale: Locale }) {
  return (
    <p role="alert" className="rounded-2xl bg-red-50 p-6 text-center text-red-800 ring-1 ring-red-200">
      {t(locale, "home.unavailable")}
    </p>
  );
}
