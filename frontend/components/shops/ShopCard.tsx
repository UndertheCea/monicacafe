import Link from "next/link";
import type { ShopSummary } from "@/lib/api";
import { t, type Locale } from "@/lib/i18n/dict";
import { ShopLogo } from "./ShopLogo";

export function ShopCard({ shop, locale }: { shop: ShopSummary; locale: Locale }) {
  return (
    <article className="relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200 transition hover:shadow-md focus-within:ring-2 focus-within:ring-ink">
      {/* No banner: no band at all, the card stays plain white (#112). */}
      {shop.bannerUrl && (
        <div className="relative h-28 border-b border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shop.bannerUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        </div>
      )}
      <div className="flex flex-1 flex-col p-4">
        <ShopLogo name={shop.name} logoUrl={shop.logoUrl} size="md" className={`relative mb-3 ${shop.bannerUrl ? "-mt-10 outline-4 outline-paper" : ""}`} />
        <h2 className="text-base font-bold text-ink">
          <Link href={`/shops/${shop.slug}`} className="after:absolute after:inset-0 focus:outline-none">
            {shop.name}
          </Link>
        </h2>
        {shop.city && <p className="text-xs text-neutral-500">{shop.city}</p>}
        {shop.description && <p className="mt-2 line-clamp-3 text-sm text-neutral-600">{shop.description}</p>}
        <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-sm">
          <span className="text-neutral-500">
            {shop.coffeeCount > 0
              ? t(locale, "shops.coffeesCount", { n: shop.coffeeCount })
              : t(locale, "shops.cardNoCoffees")}
            {shop.followerCount > 0 && <> · {t(locale, "follow.count", { n: shop.followerCount })}</>}
          </span>
          <span className="font-medium text-ink">{t(locale, "shops.view")} →</span>
        </div>
      </div>
    </article>
  );
}
