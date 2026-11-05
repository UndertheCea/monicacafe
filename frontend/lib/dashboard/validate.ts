// Pure seller-form checks mirroring backend/graph/helpers.go, so sellers see
// mistakes before a round-trip. No imports: `node --test` loads this directly.
// The backend stays the source of truth and re-validates everything.

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
