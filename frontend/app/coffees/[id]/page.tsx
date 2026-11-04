import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { COFFEE, isUUID } from "@/lib/api";
import { query } from "@/lib/graphql";
import { pick, t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { formatTWD } from "@/lib/utils";
import { CommentList } from "@/components/coffees/CommentList";
import { ErrorState } from "@/components/ErrorState";

type Params = Promise<{ id: string }>;

// Deduplicate the fetch between generateMetadata and the page render.
const loadCoffee = cache(async (id: string) =>
  isUUID(id) ? (await query(COFFEE, { id })).coffee : null,
);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const locale = await getLocale();
  try {
    const c = await loadCoffee(id);
    if (!c) return { title: t(locale, "coffee.notFound") };
    return { title: `${c.name} · ${c.shop.name}`, description: c.description.slice(0, 160) };
  } catch {
    return { title: t(locale, "coffees.title") };
  }
}

export default async function CoffeeDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const locale = await getLocale();

  let coffee;
  try {
    coffee = await loadCoffee(id);
  } catch (err) {
    return <ErrorState locale={locale} error={err} />;
  }
  if (!coffee) notFound();

  const [hero, ...thumbs] = coffee.imageUrls;
  const facts: [string, string][] = [
    [t(locale, "coffee.origin"), pick(locale, coffee.originCountry.nameZh, coffee.originCountry.nameEn)],
    [t(locale, "coffee.process"), pick(locale, coffee.processingMethod.nameZh, coffee.processingMethod.nameEn)],
    [t(locale, "coffee.roast"), t(locale, `roast.${coffee.roastLevel}`)],
  ];
  if (coffee.variety) facts.splice(1, 0, [t(locale, "coffee.variety"), coffee.variety.name]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Link href="/coffees" className="text-sm font-medium text-amber-700 hover:underline">
        {t(locale, "coffee.back")}
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        {/* Images */}
        <div>
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-gradient-to-br from-amber-100 via-stone-100 to-stone-200 ring-1 ring-stone-200">
            {hero ? (
              // Seller-uploaded images come from arbitrary hosts in Stage 1.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hero} alt={coffee.name} className="h-full w-full object-cover" />
            ) : (
              <span aria-hidden className="absolute inset-0 grid place-items-center text-8xl">
                ☕
              </span>
            )}
          </div>
          {thumbs.length > 0 && (
            <ul className="mt-3 grid grid-cols-4 gap-3">
              {thumbs.slice(0, 4).map((src) => (
                <li key={src} className="aspect-square overflow-hidden rounded-xl ring-1 ring-stone-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Details */}
        <div>
          {!coffee.isPublished && (
            <p className="mb-3 inline-block rounded-full bg-stone-200 px-3 py-1 text-xs font-semibold text-stone-700">
              {t(locale, "coffee.draft")}
            </p>
          )}
          <p className="text-sm text-stone-500">
            <Link href={`/shops/${coffee.shop.slug}`} className="hover:text-amber-700">
              {coffee.shop.name}
            </Link>
            {coffee.shop.city && ` · ${coffee.shop.city}`}
          </p>
          <h1 className="mt-1 text-3xl font-bold leading-tight text-stone-900">{coffee.name}</h1>

          <dl className="mt-6 grid grid-cols-2 gap-4 rounded-2xl bg-white p-5 ring-1 ring-stone-200">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs uppercase tracking-wide text-stone-500">{label}</dt>
                <dd className="mt-0.5 font-medium text-stone-900">{value}</dd>
              </div>
            ))}
          </dl>

          {coffee.flavorNotes.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold text-stone-700">{t(locale, "coffee.flavorNotes")}</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {coffee.flavorNotes.map((note) => (
                  <li key={note}>
                    <Link
                      href={`/coffees?flavor=${encodeURIComponent(note)}`}
                      className="inline-block rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
                    >
                      {note}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {coffee.description && (
            <p className="mt-6 whitespace-pre-line leading-relaxed text-stone-700">{coffee.description}</p>
          )}

          <section className="mt-8" aria-labelledby="variants-heading">
            <h2 id="variants-heading" className="text-lg font-bold text-stone-900">
              {t(locale, "coffee.variants")}
            </h2>
            {coffee.variants.length === 0 ? (
              <p className="mt-2 text-stone-500">{t(locale, "coffee.noVariants")}</p>
            ) : (
              <table className="mt-3 w-full overflow-hidden rounded-2xl bg-white text-left text-sm ring-1 ring-stone-200">
                <thead className="bg-stone-50 text-stone-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">{t(locale, "coffee.grind")}</th>
                    <th className="px-4 py-2 font-medium">{t(locale, "coffee.weight")}</th>
                    <th className="px-4 py-2 font-medium">{t(locale, "coffee.price")}</th>
                    <th className="px-4 py-2 font-medium">{t(locale, "coffee.stock")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {coffee.variants.map((v) => (
                    <tr key={v.id} className={v.isAvailable ? "" : "text-stone-400"}>
                      <td className="px-4 py-2">{t(locale, `grind.${v.grind}`)}</td>
                      <td className="px-4 py-2">{v.weightG} g</td>
                      <td className="px-4 py-2 font-semibold">NT${formatTWD(v.priceTwd)}</td>
                      <td className="px-4 py-2">
                        {v.isAvailable ? t(locale, "coffee.inStock", { n: v.stock }) : t(locale, "coffees.soldOut")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {/* Stage 1 is discovery only — cart & ECPay checkout land in Stage 2. */}
            <p className="mt-3 rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-600">
              {t(locale, "coffee.checkoutSoon")}
            </p>
          </section>

          <aside className="mt-8 flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
            <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-amber-100 text-xl">
              {coffee.shop.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coffee.shop.logoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span aria-hidden>☕</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-stone-500">{t(locale, "coffee.soldBy")}</p>
              <p className="truncate font-semibold text-stone-900">{coffee.shop.name}</p>
            </div>
            <Link
              href={`/shops/${coffee.shop.slug}`}
              className="shrink-0 rounded-full border border-stone-300 px-4 py-2 text-sm hover:border-stone-500"
            >
              {t(locale, "coffee.visitShop")}
            </Link>
          </aside>
        </div>
      </div>

      <CommentList comments={coffee.comments} total={coffee.commentCount} locale={locale} />
    </main>
  );
}
