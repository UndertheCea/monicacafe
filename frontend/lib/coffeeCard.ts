// What a coffee card's body prints, so every fact is written once (#294).
//
// With a photo, the picture carries no words: the body prints the name, "producer · region" and
// "country · process · variety". Without a photo, the colour tile already carries the name, variety · process and
// region · country (lib/coffeeTile.ts), so the body leaves those out and keeps only what the tile can't show: the
// producer.

interface CardWords {
  hasPhoto: boolean;
  producer?: string | null;
  region?: string | null;
  country: string;
  process: string;
  variety?: string | null;
}

export interface CardLines {
  /** Under the name: "producer · region" (photo) or just the producer (tile). */
  source: string;
  /** "country · process · variety"; empty when the tile already says it. */
  facts: string;
}

const join = (parts: (string | null | undefined)[]) =>
  parts
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" · ");

export function cardLines(w: CardWords): CardLines {
  if (!w.hasPhoto) return { source: join([w.producer]), facts: "" };
  return { source: join([w.producer, w.region]), facts: join([w.country, w.process, w.variety]) };
}
