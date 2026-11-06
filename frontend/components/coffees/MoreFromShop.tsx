import Link from "next/link";
import type { CoffeeCardData } from "@/lib/api";
import { t, type Locale } from "@/lib/i18n/dict";
import { CoffeeCard } from "./CoffeeCard";

/** The shop's other published coffees below a coffee page; hidden when there are none. */
export function MoreFromShop({
  coffees,
  total,
  shop,
  locale,
}: {
  coffees: CoffeeCardData[];
  total: number;
  shop: { slug: string; name: string };
  locale: Locale;
}) {
  if (coffees.length === 0) return null;
  return (
    <section aria-labelledby="more-from-shop" className="mt-12">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="more-from-shop" className="text-xl font-bold text-stone-900">
          {t(locale, "coffee.moreFromShop", { shop: shop.name })}
        </h2>
        {total > coffees.length + 1 && (
          <Link href={`/shops/${shop.slug}`} className="text-sm font-medium text-amber-700 hover:underline">
            {t(locale, "coffee.moreFromShopAll", { n: total })}
          </Link>
        )}
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {coffees.map((c) => (
          <CoffeeCard key={c.id} coffee={c} locale={locale} />
        ))}
      </div>
    </section>
  );
}
