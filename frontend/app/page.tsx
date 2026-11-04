import Link from "next/link";
import { HOME, type HomeData } from "@/lib/api";
import { query } from "@/lib/graphql";
import { t, type Locale } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { CoffeeCard } from "@/components/coffees/CoffeeCard";
import { ShopCard } from "@/components/shops/ShopCard";

const POPULAR_LIMIT = 4;
const FEATURED_SHOPS = 3;

export default async function HomePage() {
  const locale = await getLocale();

  // The hero and feature grid render even if the API is down; only the
  // data-driven strips degrade to a short notice.
  let data: HomeData | null = null;
  try {
    data = await query(HOME, { coffeeLimit: POPULAR_LIMIT, shopLimit: FEATURED_SHOPS });
  } catch {
    data = null;
  }

  return (
    <main>
      <Hero locale={locale} />

      <section className="mx-auto max-w-7xl px-4 py-16">
        <SectionHeader
          title={t(locale, "home.popularTitle")}
          subtitle={t(locale, "home.popularSubtitle")}
          href="/coffees"
          linkLabel={t(locale, "home.seeAllCoffees")}
        />
        {data === null ? (
          <Unavailable locale={locale} />
        ) : data.popularCoffees.length === 0 ? (
          <Empty text={t(locale, "home.noCoffees")} />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {data.popularCoffees.map((c) => (
              <CoffeeCard key={c.id} coffee={c} locale={locale} />
            ))}
          </div>
        )}
      </section>

      <section className="bg-white py-16">
        <div className="mx-auto max-w-7xl px-4">
          <SectionHeader
            title={t(locale, "home.shopsTitle")}
            subtitle={t(locale, "home.shopsSubtitle")}
            href="/shops"
            linkLabel={t(locale, "home.seeAllShops")}
          />
          {data === null ? (
            <Unavailable locale={locale} />
          ) : data.shops.nodes.length === 0 ? (
            <Empty text={t(locale, "shops.empty")} />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {data.shops.nodes.map((s) => (
                <ShopCard key={s.id} shop={s} locale={locale} />
              ))}
            </div>
          )}
        </div>
      </section>

      <Features locale={locale} />
    </main>
  );
}

function Hero({ locale }: { locale: Locale }) {
  return (
    <section className="bg-stone-900 px-4 py-24 text-center md:py-32">
      <div className="mx-auto max-w-4xl">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-amber-400">
          {t(locale, "home.eyebrow")}
        </p>
        <h1 className="mb-6 text-4xl font-bold leading-tight text-white md:text-6xl">
          {t(locale, "home.titleLead")} <span className="text-amber-300">{t(locale, "home.titleAccent")}</span>
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
  );
}

function Features({ locale }: { locale: Locale }) {
  const features = [
    { icon: "☕", title: t(locale, "home.feature1Title"), body: t(locale, "home.feature1Body") },
    { icon: "🗺️", title: t(locale, "home.feature2Title"), body: t(locale, "home.feature2Body") },
    { icon: "💬", title: t(locale, "home.feature3Title"), body: t(locale, "home.feature3Body") },
  ];
  return (
    <section className="px-4 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-12 text-center text-3xl font-bold text-stone-900">{t(locale, "home.whyTitle")}</h2>
        <div className="grid gap-8 md:grid-cols-3">
          {features.map((f) => (
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
  );
}

function SectionHeader({
  title,
  subtitle,
  href,
  linkLabel,
}: {
  title: string;
  subtitle: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-2xl font-bold text-stone-900">{title}</h2>
        <p className="mt-1 text-stone-600">{subtitle}</p>
      </div>
      <Link href={href} className="text-sm font-medium text-amber-700 hover:underline">
        {linkLabel} →
      </Link>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl bg-stone-50 p-8 text-center text-stone-500 ring-1 ring-stone-200">{text}</p>;
}

function Unavailable({ locale }: { locale: Locale }) {
  return (
    <p role="status" className="rounded-2xl bg-stone-50 p-8 text-center text-stone-500 ring-1 ring-stone-200">
      {t(locale, "error.title")} — {t(locale, "error.retry")}
    </p>
  );
}
