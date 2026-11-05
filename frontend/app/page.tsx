import Link from "next/link";
import { HOME } from "@/lib/api";
import { query } from "@/lib/graphql";
import { t, type MessageKey } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { ErrorState } from "@/components/ErrorState";
import { CoffeeCard } from "@/components/coffees/CoffeeCard";
import { ShopCard } from "@/components/shops/ShopCard";

const POPULAR_LIMIT = 4;
const SHOP_LIMIT = 3;

const FEATURES: { icon: string; title: MessageKey; body: MessageKey }[] = [
  { icon: "🏠", title: "home.f1Title", body: "home.f1Body" },
  { icon: "☕", title: "home.f2Title", body: "home.f2Body" },
  { icon: "💬", title: "home.f3Title", body: "home.f3Body" },
];

export default async function HomePage() {
  const locale = await getLocale();

  let data;
  try {
    data = await query(HOME, { popularLimit: POPULAR_LIMIT, shopLimit: SHOP_LIMIT });
  } catch (err) {
    return <ErrorState locale={locale} error={err} />;
  }

  return (
    <main>
      {/* Hero */}
      <section className="bg-stone-900 px-4 py-24 text-center md:py-32">
        <div className="mx-auto max-w-4xl">
          <p className="mb-4 text-sm font-semibold tracking-[0.2em] text-amber-400">{t(locale, "home.eyebrow")}</p>
          <h1 className="mb-6 text-4xl font-bold leading-tight text-white md:text-6xl">
            {t(locale, "home.title")} <span className="text-amber-300">{t(locale, "home.titleAccent")}</span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-stone-300">{t(locale, "home.body")}</p>
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
      <section className="mx-auto max-w-7xl px-4 py-16">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="text-2xl font-bold text-stone-900">{t(locale, "home.popular")}</h2>
          <Link href="/coffees" className="text-sm font-medium text-amber-700 hover:underline">
            {t(locale, "home.seeAll")}
          </Link>
        </div>
        {data.popularCoffees.length === 0 ? (
          <p className="rounded-2xl bg-white p-10 text-center text-stone-500 ring-1 ring-stone-200">
            {t(locale, "home.popularEmpty")}
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {data.popularCoffees.map((c) => (
              <CoffeeCard key={c.id} coffee={c} locale={locale} />
            ))}
          </div>
        )}
      </section>

      {/* Featured shops */}
      {data.shops.nodes.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-16">
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="text-2xl font-bold text-stone-900">{t(locale, "home.featuredShops")}</h2>
            <Link href="/shops" className="text-sm font-medium text-amber-700 hover:underline">
              {t(locale, "home.seeAll")}
            </Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.shops.nodes.map((s) => (
              <ShopCard key={s.id} shop={s} locale={locale} />
            ))}
          </div>
        </section>
      )}

      {/* Why */}
      <section className="bg-stone-50 px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-12 text-center text-2xl font-bold text-stone-900">{t(locale, "home.why")}</h2>
          <div className="grid gap-8 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-stone-100">
                <span aria-hidden className="mb-4 block text-4xl">
                  {f.icon}
                </span>
                <h3 className="mb-3 text-lg font-semibold text-stone-900">{t(locale, f.title)}</h3>
                <p className="text-stone-600">{t(locale, f.body)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
