import { coffeeTile, tileLines } from "@/lib/coffeeTile";

/**
 * A coffee without a photo (#111): a solid soft Radix colour. Fills its parent (the parent sets the size / aspect
 * ratio). Seller text is rendered as JSX text, never HTML. Every fact is written once (#294): where the words are
 * already on the page next to the tile, the tile is plain colour.
 *
 * - "card": carries the words (name + variety · process + origin, in the seller's own case: no forced capitals, so
 *   English and Chinese sit together); the card's body then leaves them out. One image named after the coffee.
 * - "thumb" / "hero": colour only (thumbnails are too small; the coffee page prints the name and facts right below).
 */
export function CoffeeTile({
  id,
  name,
  variety,
  process,
  origin,
  size = "card",
}: {
  id: string;
  name: string;
  variety?: string | null;
  process?: string | null;
  origin?: string | null;
  size?: "thumb" | "card" | "hero";
}) {
  const { background } = coffeeTile(id);
  if (size === "thumb") {
    return <span aria-hidden className="block h-full w-full" style={{ background }} />;
  }
  if (size === "hero") {
    return <div role="img" aria-label={name} className="h-full w-full" style={{ background }} />;
  }
  const lines = tileLines({ variety, process, origin });
  return (
    <div role="img" aria-label={name} className="flex h-full w-full flex-col justify-end p-4 text-ink" style={{ background }}>
      <p className="line-clamp-3 break-words text-xl font-bold leading-tight tracking-tight">{name}</p>
      {lines.map((line) => (
        <p key={line} className="mt-1 line-clamp-1 break-words text-sm font-medium">
          {line}
        </p>
      ))}
    </div>
  );
}
