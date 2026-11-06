import Link from "next/link";
import type { CoffeeDetail } from "@/lib/api";
import { pick, t, type Locale } from "@/lib/i18n/dict";
import { pricePer100g } from "@/lib/pricing";
import { formatTWD } from "@/lib/utils";
import { PhotoGallery } from "./PhotoGallery";

/**
 * The body of a coffee page: images, facts, flavour notes, description,
 * options and seller. Pure render (no data fetching, no hooks), so the public
 * server page and the seller's client-side draft preview share it.
 */
export function CoffeeDetailView({ coffee, locale }: { coffee: CoffeeDetail; locale: Locale }) {
  const facts: [string, string][] = [
    [t(locale, "coffee.origin"), pick(locale, coffee.originCountry.nameZh, coffee.originCountry.nameEn)],
    [t(locale, "coffee.process"), pick(locale, coffee.processingMethod.nameZh, coffee.processingMethod.nameEn)],
    [t(locale, "coffee.roast"), t(locale, `roast.${coffee.roastLevel}`)],
  ];
  if (coffee.variety) facts.splice(1, 0, [t(locale, "coffee.variety"), coffee.variety.name]);

  return (
    <div className="mt-6 grid gap-10 lg:grid-cols-2">
      {/* Images */}
      <PhotoGallery images={coffee.imageUrls} name={coffee.name} locale={locale} />

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
                    <td className="px-4 py-2">
                      <span className="font-semibold">NT${formatTWD(v.priceTwd)}</span>
                      <Per100g locale={locale} priceTwd={v.priceTwd} weightG={v.weightG} />
                    </td>
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
  );
}

/** "NT$X / 100 g" under a variant price; nothing for 100 g bags or bad weights. */
function Per100g({ locale, priceTwd, weightG }: { locale: Locale; priceTwd: number; weightG: number }) {
  const per100 = pricePer100g(priceTwd, weightG);
  if (per100 === null || weightG === 100) return null;
  return (
    <span className="block text-xs font-normal text-stone-500">
      {t(locale, "coffee.per100g", { price: formatTWD(per100) })}
    </span>
  );
}
