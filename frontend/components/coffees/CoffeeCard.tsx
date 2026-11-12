import Link from "next/link";
import { fromPrice, type CoffeeCardData } from "@/lib/api";
import { pick, t, type Locale } from "@/lib/i18n/dict";
import { originLine } from "@/lib/provenance";
import { formatTWD } from "@/lib/utils";
import { CoffeeTile } from "./CoffeeTile";
import { Badge, Card, Picture } from "@/components/ui";

export function CoffeeCard({ coffee, locale }: { coffee: CoffeeCardData; locale: Locale }) {
  const price = fromPrice(coffee);
  const img = coffee.imageUrls[0];
  const country = pick(locale, coffee.originCountry.nameZh, coffee.originCountry.nameEn);
  // Producer · region tells two coffees from the same country apart.
  const source = originLine({ producer: coffee.producer, region: coffee.region });

  return (
    <Card as="article" className="relative flex flex-col overflow-hidden focus-within:ring-2 focus-within:ring-ink">
      <div className="relative aspect-[4/3] bg-paper">
        {img ? (
          <Picture src={img} thumb width={640} height={480} alt={`${coffee.name} · ${coffee.shop.name}`} />
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
          <Badge tone="outline" className="absolute left-3 top-3">
            {t(locale, `roast.${coffee.roastLevel}`)}
          </Badge>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs text-muted">
          {coffee.shop.name}
          {coffee.shop.city && ` · ${coffee.shop.city}`}
        </p>
        <h3 className="mt-1 text-base font-bold leading-snug text-ink">
          {/* Stretched link: the whole card is clickable, one tab stop. */}
          <Link href={`/coffees/${coffee.id}`} className="after:absolute after:inset-0">
            {coffee.name}
          </Link>
        </h3>
        {source && <p className="mt-1 line-clamp-1 text-sm text-muted">{source}</p>}
        <p className="label-caps mt-2 text-muted">
          {country}
          {" · "}
          {pick(locale, coffee.processingMethod.nameZh, coffee.processingMethod.nameEn)}
          {coffee.variety && ` · ${coffee.variety.name}`}
        </p>

        {coffee.flavorNotes.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {coffee.flavorNotes.slice(0, 4).map((note) => (
              <li key={note} className="rounded-full bg-white px-2 py-0.5 text-xs text-ink ring-1 ring-line">
                {note}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto flex items-end justify-between pt-4">
          <span className={price === null ? "text-sm text-muted" : "text-base font-bold text-ink"}>
            {price === null ? t(locale, "coffees.soldOut") : t(locale, "coffees.from", { price: formatTWD(price) })}
          </span>
          <span className="text-xs text-muted">{t(locale, "coffees.comments", { n: coffee.commentCount })}</span>
        </div>
      </div>
    </Card>
  );
}
