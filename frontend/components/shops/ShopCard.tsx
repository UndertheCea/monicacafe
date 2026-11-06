import Link from "next/link";
import type { ShopSummary } from "@/lib/api";
import { t, type Locale } from "@/lib/i18n/dict";

export function ShopCard({ shop, locale }: { shop: ShopSummary; locale: Locale }) {
  return (
    <article className="relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200 transition hover:shadow-md focus-within:ring-2 focus-within:ring-amber-500">
      <div className="relative h-28 bg-gradient-to-br from-stone-800 to-amber-700">
        {shop.bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shop.bannerUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="relative -mt-10 mb-2 grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-amber-100 text-2xl ring-4 ring-white">
          {shop.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shop.logoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span aria-hidden>☕</span>
          )}
        </div>
        <h2 className="text-base font-bold text-stone-900">
          <Link href={`/shops/${shop.slug}`} className="after:absolute after:inset-0 focus:outline-none">
            {shop.name}
          </Link>
        </h2>
        {shop.city && <p className="text-xs text-stone-500">{shop.city}</p>}
        {shop.description && <p className="mt-2 line-clamp-3 text-sm text-stone-600">{shop.description}</p>}
        <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-sm">
          <span className="text-stone-500">
            {shop.coffeeCount > 0
              ? t(locale, "shops.coffeesCount", { n: shop.coffeeCount })
              : t(locale, "shops.cardNoCoffees")}
          </span>
          <span className="font-medium text-amber-700">{t(locale, "shops.view")} →</span>
        </div>
      </div>
    </article>
  );
}
