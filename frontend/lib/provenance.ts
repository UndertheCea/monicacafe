/**
 * Coffee provenance (#116): producer, region and growing altitude. Blank text
 * and null altitudes mean "not given" and are left out everywhere.
 */

export interface Provenance {
  producer: string;
  region: string;
  altitudeMinM: number | null;
  altitudeMaxM: number | null;
}

const metres = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/**
 * "1,900 m" for one height, "1,800–2,100 m" for a range; null when not given.
 * A range whose ends are equal reads as one height.
 */
export function formatAltitude(minM: number | null | undefined, maxM: number | null | undefined): string | null {
  if (minM == null) return null;
  if (maxM == null || maxM === minM) return `${metres.format(minM)} m`;
  return `${metres.format(minM)}–${metres.format(maxM)} m`;
}

/** The i18n keys of the facts below, in display order. */
export type ProvenanceKey = "coffee.producer" | "coffee.region" | "coffee.altitude";

/** The provenance facts that are set, as [i18n key, value] pairs. */
export function provenanceFacts(p: Provenance): [ProvenanceKey, string][] {
  const out: [ProvenanceKey, string][] = [];
  const producer = p.producer.trim();
  const region = p.region.trim();
  const altitude = formatAltitude(p.altitudeMinM, p.altitudeMaxM);
  if (producer) out.push(["coffee.producer", producer]);
  if (region) out.push(["coffee.region", region]);
  if (altitude) out.push(["coffee.altitude", altitude]);
  return out;
}

/**
 * Where a coffee comes from as one short line, most specific first:
 * "Producer · Region · Country", skipping blank parts. Cards pass producer +
 * region (the country is already on the card); the colour tile passes region
 * + country.
 */
export function originLine(parts: { producer?: string | null; region?: string | null; country?: string | null }): string {
  return [parts.producer, parts.region, parts.country]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}
