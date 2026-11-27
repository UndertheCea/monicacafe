import Link from "next/link";
import { fromPrice, type CoffeeCardData } from "@/lib/api";
import { pick, t, type Locale } from "@/lib/i18n/dict";
import { cardLines } from "@/lib/coffeeCard";
import { originLine } from "@/lib/provenance";
import type { SearchMatch } from "@/lib/searchMatch";
import { formatTWD } from "@/lib/utils";
import { CoffeeTile } from "./CoffeeTile";
import { Badge, Card, Picture } from "@/components/ui";
import { cardCount } from "@/lib/plural";

export function CoffeeCard({
  coffee,
  locale,
  match,
}: {
  coffee: CoffeeCardData;
  locale: Locale;
  /** Why a keyword-search result matched, when the card doesn't show it (#274). */
  match?: SearchMatch | null;
}) {
  const price = fromPrice(coffee);
  const comments = cardCount(locale, "coffees.comments", coffee.commentCount);
  const img = coffee.imageUrls[0];
  const country = pick(locale, coffee.originCountry.nameZh, coffee.originCountry.nameEn);
  const process = pick(locale, coffee.processingMethod.nameZh, coffee.processingMethod.nameEn);
  // Every fact once: a photo card's body prints the words; a colour tile carries them itself (#294).
  const { source, facts } = cardLines({
    hasPhoto: Boolean(img),
    producer: coffee.producer,
    region: coffee.region,
    country,
    process,
    variety: coffee.variety?.name,
  });

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
            process={process}
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
        {/* A long shop name is cut with an ellipsis; the city always stays whole. */}
        <p className="flex min-w-0 text-xs text-muted">
          <span className="min-w-0 truncate">{coffee.shop.name}</span>
          {coffee.shop.city && <span className="shrink-0 whitespace-pre">{` · ${coffee.shop.city}`}</span>}
        </p>
        {img ? (
          <h3 className="mt-1 text-base font-bold leading-snug text-ink">
            {/* Stretched link: the whole card is clickable, one tab stop. */}
            <Link href={`/coffees/${coffee.id}`} className="after:absolute after:inset-0">
              {coffee.name}
            </Link>
          </h3>
        ) : (
          <>
            {/* The tile above already shows the name: the heading and the card link stay for screen readers and clicks. */}
            <h3 className="sr-only">{coffee.name}</h3>
            <Link href={`/coffees/${coffee.id}`} aria-label={coffee.name} className="absolute inset-0 z-10" />
          </>
        )}
        {source && <p className="mt-1 line-clamp-1 text-sm text-muted">{source}</p>}
        {facts && <p className="mt-1 line-clamp-2 break-words text-xs text-muted">{facts}</p>}

        {coffee.flavorNotes.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {coffee.flavorNotes.slice(0, 4).map((note) => (
              <li key={note} className="rounded-full bg-white px-2 py-0.5 text-xs text-ink ring-1 ring-line">
                {note}
              </li>
            ))}
          </ul>
        )}

        {match && (
          <p className="mt-3 line-clamp-2 text-xs text-muted">
            {t(locale, "search.matched", { field: t(locale, `search.field.${match.field}`) })}{" "}
            {match.before}
            <mark className="bg-transparent font-semibold text-ink underline underline-offset-2">{match.match}</mark>
            {match.after}
          </p>
        )}

        <div className="mt-auto flex items-end justify-between pt-4">
          <span className={price === null ? "text-sm text-muted" : "text-base font-bold text-ink"}>
            {price === null ? t(locale, "coffees.soldOut") : t(locale, "coffees.from", { price: formatTWD(price) })}
          </span>
          {comments && <span className="text-xs text-muted">{comments}</span>}
        </div>
      </div>
    </Card>
  );
}
