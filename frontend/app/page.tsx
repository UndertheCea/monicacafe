import Link from "next/link";
import { POPULAR_COFFEES, SHOPS, type CoffeeCardData, type ShopSummary } from "@/lib/api";
import { query } from "@/lib/graphql";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { CoffeeCard } from "@/components/coffees/CoffeeCard";
import { ShopCard } from "@/components/shops/ShopCard";

const POPULAR_LIMIT = 4;
const NEW_SHOPS_LIMIT = 4;

const FEATURES: { icon: string; title: MessageKey; body: MessageKey }[] = [
  { icon: "☕", title: "home.f1Title", body: "home.f1Body" },
  { icon: "🗺️", title: "home.f2Title", body: "home.f2Body" },
  { icon: "🏡", title: "home.f3Title", body: "home.f3Body" },
];

/** Resolve to null instead of throwing so one failed strip doesn't blank the page. */
async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const locale = await getLocale();
  const [popular, shops] = await Promise.all([
    settle(query(POPULAR_COFFEES, { limit: POPULAR_LIMIT })),
    settle(query(SHOPS, { limit: NEW_SHOPS_LIMIT })),
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
            {t(locale, "home.title")}
            <span className="mt-2 block italic text-amber-300">{t(locale, "home.titleAccent")}</span>
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

      <Strip
        locale={locale}
        title="home.popular"
        sub="home.popularSub"
        href="/coffees"
        items={popular?.popularCoffees ?? null}
        empty="home.emptyPopular"
        render={(c: CoffeeCardData) => <CoffeeCard key={c.id} coffee={c} locale={locale} />}
      />

      <Strip
        locale={locale}
        title="home.shops"
        sub="home.shopsSub"
        href="/shops"
        items={shops?.shops.nodes ?? null}
        empty="shops.empty"
        render={(s: ShopSummary) => <ShopCard key={s.id} shop={s} locale={locale} />}
      />

      {/* Features */}
      <section className="bg-stone-50 px-4 py-20">
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

function Strip<T>({
  locale,
  title,
  sub,
  href,
  items,
  empty,
  render,
}: {
  locale: Locale;
  title: MessageKey;
  sub: MessageKey;
  href: string;
  items: T[] | null;
  empty: MessageKey;
  render: (item: T) => React.ReactNode;
}) {
  const id = `strip-${title.replace(/\W/g, "-")}`;
  return (
    <section aria-labelledby={id} className="mx-auto max-w-7xl px-4 py-14">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 id={id} className="text-2xl font-bold text-stone-900">
            {t(locale, title)}
          </h2>
          <p className="mt-1 text-sm text-stone-500">{t(locale, sub)}</p>
        </div>
        <Link href={href} className="shrink-0 text-sm font-medium text-amber-700 hover:underline">
          {t(locale, "home.seeAll")}
        </Link>
      </div>
      {items === null ? (
        <p role="status" className="rounded-2xl bg-white p-8 text-center text-stone-500 ring-1 ring-stone-200">
          {t(locale, "home.unavailable")}
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-stone-500 ring-1 ring-stone-200">{t(locale, empty)}</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{items.map(render)}</div>
      )}
    </section>
  );
}
