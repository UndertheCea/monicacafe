import { coffeeTile, tileLines } from "@/lib/coffeeTile";

/**
 * A coffee without a photo (#111): a solid soft Radix colour with the coffee's name and a few small
 * uppercase lines written on it in black. Fills its parent (the parent sets the size / aspect ratio).
 * Seller text is rendered as JSX text, never HTML.
 *
 * - "thumb": colour only (list thumbnails are too small for words; the name sits next to them).
 * - "card" / "hero": name + lines; exposed as one image named after the coffee, like a photo would be.
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
  const lines = tileLines({ variety, process, origin });
  const hero = size === "hero";
  return (
    <div
      role="img"
      aria-label={name}
      className={`flex h-full w-full flex-col justify-end text-ink ${hero ? "p-8 sm:p-10" : "p-4"}`}
      style={{ background }}
    >
      <p className={`font-bold leading-tight tracking-tight ${hero ? "text-3xl sm:text-4xl" : "line-clamp-3 text-xl"}`}>
        {name}
      </p>
      {lines.map((line) => (
        <p key={line} className={`label-caps ${hero ? "mt-2" : "mt-1"} line-clamp-1`}>
          {line}
        </p>
      ))}
    </div>
  );
}
