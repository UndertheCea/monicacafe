// Pure seller-form checks mirroring backend/graph/helpers.go, so sellers see
// mistakes before a round-trip. No imports: `node --test` loads this directly.
// The backend stays the source of truth and re-validates everything.

import type { CupProfile } from "../cupProfile";

export const LIMITS = {
  shopName: 80,
  shopDescription: 2000,
  city: 40,
  coffeeName: 120,
  coffeeDescription: 5000,
  flavorNotes: 10,
  flavorNote: 30,
  variants: 10,
  weightG: 10_000,
  priceTwd: 1_000_000,
  stock: 100_000,
  provenance: 100,
  altitudeM: 6000,
  harvestYearMin: 2000,
} as const;

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Rune length (matches Go's utf8.RuneCountInString). */
export const runes = (s: string) => [...s].length;

/** Normalised shop slug, or null when it can't be valid. */
export function normaliseShopSlug(s: string): string | null {
  const v = s.trim().toLowerCase();
  return v.length >= 3 && v.length <= 48 && SLUG_RE.test(v) ? v : null;
}

/** Suggest a slug from a shop name (ASCII only; Chinese names give ""). */
export function suggestSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
}

/** Split a comma / 、 / newline separated list of flavor notes, deduped case-insensitively. */
export function parseFlavorNotes(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[,，、\n]/)) {
    const n = raw.trim();
    if (!n || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    out.push(n);
  }
  return out;
}

export interface VariantDraft {
  grind: string;
  weightG: string;
  priceTwd: string;
  stock: string;
}

export type VariantProblem = "weight" | "price" | "stock" | "duplicate";

/** Whole-number string within [min, max], else null. TWD has no decimals. */
export function parseWhole(s: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(s.trim())) return null;
  const n = Number(s.trim());
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}

/** Per-row problems for a list of variant rows (index → problem). */
export function variantProblems(rows: VariantDraft[]): Map<number, VariantProblem> {
  const out = new Map<number, VariantProblem>();
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const w = parseWhole(r.weightG, 1, LIMITS.weightG);
    if (w === null) return void out.set(i, "weight");
    if (parseWhole(r.priceTwd, 0, LIMITS.priceTwd) === null) return void out.set(i, "price");
    if (parseWhole(r.stock, 0, LIMITS.stock) === null) return void out.set(i, "stock");
    const key = `${r.grind}/${w}`;
    if (seen.has(key)) return void out.set(i, "duplicate");
    seen.add(key);
  });
  return out;
}

// ── Coffee details (shared by the new-coffee and edit-coffee forms) ─────────

/** A coffee's editable text fields. `varietyId` is null when none is set. */
export interface CoffeeDetails {
  name: string;
  description: string;
  originCountryId: string;
  processingMethodId: string;
  varietyId: string | null;
  roastLevel: string;
  flavorNotes: string[];
  /** Provenance as typed: blank = not given. Altitudes are metres. */
  producer: string;
  region: string;
  altitudeMin: string;
  altitudeMax: string;
  /** FILTER | ESPRESSO | OMNI, or null when not given. */
  brewMethod: string | null;
  /** The crop year as typed: blank = not given. */
  harvestYear: string;
  /** Cup profile as chosen: "" = not given, else "1"–"5". */
  acidity: string;
  sweetness: string;
  body: string;
}

/** "notesRequired": no flavour note at all (#181); "notes": too many or too long. */
export type CoffeeDetailsProblem = "required" | "notesRequired" | "notes" | "altitude" | "harvest" | "cup";

/** The calendar year in Taiwan (UTC+8, no DST): what the API compares crop years with. */
export function taipeiYear(now: Date = new Date()): number {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).getUTCFullYear();
}

/**
 * Parse the harvest-year box: blank → null (not given); a whole year from
 * 2000 through `latest` (this year in Taipei) → the year; anything else →
 * "invalid". Mirrors validateHarvestYear in backend/graph/helpers.go.
 */
export function parseHarvestYear(s: string, latest: number = taipeiYear()): number | null | "invalid" {
  const v = s.trim();
  if (!v) return null;
  return parseWhole(v, LIMITS.harvestYearMin, latest) ?? "invalid";
}

/** Parse a cup-scale select ("" or "1"–"5"); anything else is "not given". */
export function parseCupValue(s: string): number | null {
  const v = s.trim();
  return /^[1-5]$/.test(v) ? Number(v) : null;
}

/** The three cup scales from the form; null when none is set (no profile). */
export function cupProfileFromForm(d: Pick<CoffeeDetails, "acidity" | "sweetness" | "body">): CupProfile | null {
  const p = { acidity: parseCupValue(d.acidity), sweetness: parseCupValue(d.sweetness), body: parseCupValue(d.body) };
  return p.acidity === null && p.sweetness === null && p.body === null ? null : p;
}

export type Altitude = { minM: number | null; maxM: number | null };

/**
 * Parse the altitude boxes (metres; "1,800" and spaces are accepted). Both
 * blank → not given; the lowest alone → one height; a highest without a
 * lowest, a non-whole number, a value outside 0–6000 or a highest below the
 * lowest → "invalid". Mirrors validateAltitude in backend/graph/helpers.go.
 */
export function parseAltitude(min: string, max: string): Altitude | "invalid" {
  const clean = (s: string) => s.replace(/[,，\s]/g, "");
  const a = clean(min);
  const b = clean(max);
  if (!a) return b ? "invalid" : { minM: null, maxM: null };
  const minM = parseWhole(a, 0, LIMITS.altitudeM);
  if (minM === null) return "invalid";
  if (!b) return { minM, maxM: null };
  const maxM = parseWhole(b, minM, LIMITS.altitudeM);
  return maxM === null ? "invalid" : { minM, maxM };
}

/** First problem with a coffee's details, or null. Mirrors the backend checks. */
export function coffeeDetailsProblem(d: CoffeeDetails, roastLevels: readonly string[]): CoffeeDetailsProblem | null {
  const name = d.name.trim();
  if (!name || !d.originCountryId || !d.processingMethodId || !roastLevels.includes(d.roastLevel)) return "required";
  if (runes(name) > LIMITS.coffeeName || runes(d.description.trim()) > LIMITS.coffeeDescription) return "required";
  if (runes(d.producer.trim()) > LIMITS.provenance || runes(d.region.trim()) > LIMITS.provenance) return "required";
  if (d.flavorNotes.length === 0) return "notesRequired";
  if (d.flavorNotes.length > LIMITS.flavorNotes || d.flavorNotes.some((n) => runes(n) > LIMITS.flavorNote)) return "notes";
  if (parseAltitude(d.altitudeMin, d.altitudeMax) === "invalid") return "altitude";
  if (parseHarvestYear(d.harvestYear) === "invalid") return "harvest";
  return null;
}

/**
 * Which details problem a BAD_USER_INPUT error's `field` points at. `notesSent`
 * is how many flavour notes the request carried: none means the API refused an
 * empty list (#181) rather than too many or too long.
 */
export function apiDetailsProblem(field: string | undefined, notesSent?: number): CoffeeDetailsProblem {
  if (field === "flavorNotes") return notesSent === 0 ? "notesRequired" : "notes";
  // brewMethod / clearBrewMethod can only fail on a stale or tampered form.
  if (field === "altitudeMinM" || field === "altitudeMaxM" || field === "clearAltitude") return "altitude";
  if (field === "harvestYear" || field === "clearHarvestYear") return "harvest";
  if (["acidity", "sweetness", "body", "cupProfile", "clearCupProfile"].includes(field ?? "")) return "cup";
  return "required";
}

/** The `updateCoffee` input for the fields that changed (empty object = nothing to save). */
export interface CoffeeDetailsPatch {
  name?: string;
  description?: string;
  originCountryId?: string;
  processingMethodId?: string;
  varietyId?: string;
  clearVariety?: boolean;
  roastLevel?: string;
  flavorNotes?: string[];
  producer?: string;
  region?: string;
  altitudeMinM?: number;
  altitudeMaxM?: number;
  clearAltitude?: boolean;
  brewMethod?: string;
  clearBrewMethod?: boolean;
  harvestYear?: number;
  clearHarvestYear?: boolean;
  cupProfile?: CupProfile;
  clearCupProfile?: boolean;
}

export function coffeeDetailsPatch(before: CoffeeDetails, after: CoffeeDetails): CoffeeDetailsPatch {
  const p: CoffeeDetailsPatch = {};
  const name = after.name.trim();
  const description = after.description.trim();
  if (name !== before.name) p.name = name;
  if (description !== before.description) p.description = description;
  if (after.originCountryId !== before.originCountryId) p.originCountryId = after.originCountryId;
  if (after.processingMethodId !== before.processingMethodId) p.processingMethodId = after.processingMethodId;
  if (after.roastLevel !== before.roastLevel) p.roastLevel = after.roastLevel;
  if (after.varietyId !== before.varietyId) {
    if (after.varietyId) p.varietyId = after.varietyId;
    else p.clearVariety = true;
  }
  const sameNotes =
    after.flavorNotes.length === before.flavorNotes.length && after.flavorNotes.every((n, i) => n === before.flavorNotes[i]);
  if (!sameNotes) p.flavorNotes = after.flavorNotes;
  const producer = after.producer.trim();
  const region = after.region.trim();
  if (producer !== before.producer) p.producer = producer;
  if (region !== before.region) p.region = region;
  // The API sets both altitude ends together: send the new pair, or clear.
  const was = parseAltitude(before.altitudeMin, before.altitudeMax);
  const now = parseAltitude(after.altitudeMin, after.altitudeMax);
  const prev = was === "invalid" ? { minM: null, maxM: null } : was;
  if (now !== "invalid" && (now.minM !== prev.minM || now.maxM !== prev.maxM)) {
    if (now.minM === null) p.clearAltitude = true;
    else {
      p.altitudeMinM = now.minM;
      if (now.maxM !== null) p.altitudeMaxM = now.maxM;
    }
  }
  if ((after.brewMethod || null) !== (before.brewMethod || null)) {
    if (after.brewMethod) p.brewMethod = after.brewMethod;
    else p.clearBrewMethod = true;
  }
  const yearWas = parseHarvestYear(before.harvestYear, Infinity);
  const yearNow = parseHarvestYear(after.harvestYear);
  if (yearNow !== "invalid" && yearNow !== (yearWas === "invalid" ? null : yearWas)) {
    if (yearNow === null) p.clearHarvestYear = true;
    else p.harvestYear = yearNow;
  }
  // The API replaces the three cup scales together: send all three, or clear.
  const cupWas = cupProfileFromForm(before);
  const cupNow = cupProfileFromForm(after);
  if (JSON.stringify(cupNow) !== JSON.stringify(cupWas)) {
    if (cupNow === null) p.clearCupProfile = true;
    else p.cupProfile = cupNow;
  }
  return p;
}

// ── Shop profile ─────────────────────────────────────────────────────────────

/** Rough bounding box of Taiwan incl. Penghu, Kinmen, Matsu, Green and Orchid Islands. */
export const TAIWAN_BOUNDS = { minLat: 21.8, maxLat: 26.4, minLng: 118.1, maxLng: 122.1 } as const;

export type Coords = { lat: number; lng: number };

/**
 * Parse a lat/lng pair typed by a seller. Both blank → "empty"; a missing half,
 * non-number or out-of-range value → "invalid". Values are rounded to 6
 * decimals (~10 cm), more than enough for a shop pin.
 */
export function parseCoords(lat: string, lng: string): Coords | "empty" | "invalid" {
  const a = lat.trim();
  const b = lng.trim();
  if (!a && !b) return "empty";
  const num = /^-?\d+(\.\d+)?$/;
  if (!num.test(a) || !num.test(b)) return "invalid";
  const la = Number(a);
  const ln = Number(b);
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return "invalid";
  return { lat: roundCoord(la), lng: roundCoord(ln) };
}

export const roundCoord = (n: number) => Math.round(n * 1e6) / 1e6;

/** Whether a point falls inside Taiwan's rough bounds (a warning, never a block). */
export function inTaiwan({ lat, lng }: Coords): boolean {
  const b = TAIWAN_BOUNDS;
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

export interface ShopProfile {
  name: string;
  description: string;
  city: string;
  lat: number | null;
  lng: number | null;
}

export type ShopProfileProblem = "required" | "name" | "description" | "city" | "coords";

/** First problem with a shop profile draft, or null. Mirrors updateShop's checks. */
export function shopProfileProblem(p: ShopProfile): ShopProfileProblem | null {
  const name = p.name.trim();
  const city = p.city.trim();
  if (!name || !city) return "required";
  if (runes(name) > LIMITS.shopName) return "name";
  if (runes(p.description.trim()) > LIMITS.shopDescription) return "description";
  if (runes(city) > LIMITS.city) return "city";
  if ((p.lat === null) !== (p.lng === null)) return "coords";
  return null;
}

export interface ShopProfilePatch {
  name?: string;
  description?: string;
  city?: string;
  lat?: number;
  lng?: number;
}

/**
 * The `updateShop` input for the fields that changed. A location is always
 * sent as a pair. Clearing a saved location isn't supported by updateShop
 * (null means "unchanged"), so a blank location simply sends nothing.
 */
export function shopProfilePatch(before: ShopProfile, after: ShopProfile): ShopProfilePatch {
  const p: ShopProfilePatch = {};
  const name = after.name.trim();
  const description = after.description.trim();
  const city = after.city.trim();
  if (name !== before.name) p.name = name;
  if (description !== before.description) p.description = description;
  if (city !== before.city) p.city = city;
  if (after.lat !== null && after.lng !== null && (after.lat !== before.lat || after.lng !== before.lng)) {
    p.lat = after.lat;
    p.lng = after.lng;
  }
  return p;
}
