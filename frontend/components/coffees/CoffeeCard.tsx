import Link from "next/link";
import { fromPrice, type CoffeeCardData } from "@/lib/api";
import { pick, t, type Locale } from "@/lib/i18n/dict";
import { originLine } from "@/lib/provenance";
import { formatTWD } from "@/lib/utils";
import { CoffeeTile } from "./CoffeeTile";

export function CoffeeCard({ coffee, locale }: { coffee: CoffeeCardData; locale: Locale }) {
  const price = fromPrice(coffee);
  const img = coffee.imageUrls[0];
  const country = pick(locale, coffee.originCountry.nameZh, coffee.originCountry.nameEn);
  // Producer · region tells two coffees from the same country apart.
  const source = originLine({ producer: coffee.producer, region: coffee.region });

  return (
    <article className="relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200 transition hover:shadow-md focus-within:ring-2 focus-within:ring-ink">
      <div className="relative aspect-[4/3] bg-neutral-100">
        {img ? (
          // Seller-uploaded images come from arbitrary hosts in Stage 1.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={coffee.name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <CoffeeTile
            id={coffee.id}
            name={coffee.name}
            variety={coffee.variety?.name}
            process={pick(locale, coffee.processingMethod.nameZh, coffee.processingMethod.nameEn)}
            origin={originLine({ region: coffee.region, country })}
          />
        )}
        {coffee.roastLevel && (
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-semibold text-neutral-700">
            {t(locale, `roast.${coffee.roastLevel}`)}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs text-neutral-500">
          {coffee.shop.name}
          {coffee.shop.city && ` · ${coffee.shop.city}`}
        </p>
        <h3 className="mt-1 text-base font-bold leading-snug text-ink">
          {/* Stretched link: the whole card is clickable, one tab stop. */}
          <Link href={`/coffees/${coffee.id}`} className="after:absolute after:inset-0 focus:outline-none">
            {coffee.name}
          </Link>
        </h3>
        {source && <p className="mt-1 line-clamp-1 text-sm text-neutral-600">{source}</p>}
        <p className="label-caps mt-2 text-muted">
          {country}
          {" · "}
          {pick(locale, coffee.processingMethod.nameZh, coffee.processingMethod.nameEn)}
          {coffee.variety && ` · ${coffee.variety.name}`}
        </p>

        {coffee.flavorNotes.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {coffee.flavorNotes.slice(0, 4).map((note) => (
              <li key={note} className="rounded-full bg-white px-2 py-0.5 text-xs text-ink ring-1 ring-neutral-300">
                {note}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto flex items-end justify-between pt-4">
          <span className={price === null ? "text-sm text-neutral-400" : "text-base font-bold text-ink"}>
            {price === null ? t(locale, "coffees.soldOut") : t(locale, "coffees.from", { price: formatTWD(price) })}
          </span>
          <span className="text-xs text-neutral-400">{t(locale, "coffees.comments", { n: coffee.commentCount })}</span>
        </div>
      </div>
    </article>
  );
}
