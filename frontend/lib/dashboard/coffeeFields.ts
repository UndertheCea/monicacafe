// Which form field a coffee-details problem belongs to (#232), for the new-coffee and edit-coffee forms.
// Pure and import-free so `npm test` loads it (tests/coffeeFields.test.mjs). The messages stay where they were
// (detailsErrorKey in components/dashboard/CoffeeDetailsForm.tsx); this only says WHERE each one is shown.

/** The coffee forms' fields in visual order, then the option rows' controls (see variantField). */
export const COFFEE_ORDER = [
  "name", "origin", "process", "variety", "roast",
  "producer", "region", "altitudeMin", "altitudeMax", "notes",
] as const;
/** The fields folded under "More details", after the option rows. */
export const OPTIONAL_ORDER = ["description", "brew", "harvestYear"] as const;

export type CoffeeField = (typeof COFFEE_ORDER)[number] | (typeof OPTIONAL_ORDER)[number];
export type VariantControl = "weight" | "price" | "stock";
/** An option row's control, e.g. `variant-2-price`. */
export type VariantField = `variant-${number}-${VariantControl}`;

export const variantField = (row: number, control: VariantControl): VariantField => `variant-${row}-${control}`;

const OPTIONAL = new Set<string>(OPTIONAL_ORDER);
/** True for fields inside the folded "More details", which must be opened before focusing them. */
export function isOptionalField(field: string): boolean {
  return OPTIONAL.has(field);
}

/** API `extensions.field` names that differ from the form's (backend/graph/schema.resolvers.go, helpers.go). */
export const COFFEE_API_ALIASES: Readonly<Record<string, CoffeeField>> = {
  originCountryId: "origin",
  processingMethodId: "process",
  varietyId: "variety",
  roastLevel: "roast",
  clearRoastLevel: "roast",
  flavorNotes: "notes",
  altitudeMinM: "altitudeMin",
  altitudeMaxM: "altitudeMax",
  brewMethod: "brew",
  clearBrewMethod: "brew",
  clearHarvestYear: "harvestYear",
};

type Problem =
  | "required" | "variety" | "producer" | "region" | "notesRequired" | "notes" | "altitude" | "harvest";

/**
 * The field a client-side details problem points at. "required" is name / origin / process (or a roast level
 * that isn't one of ours); "altitude" is the lowest box unless that parses, then the highest.
 */
export function problemField(
  problem: Problem,
  d: { name: string; originCountryId: string; processingMethodId: string; altitudeMin: string },
): CoffeeField {
  switch (problem) {
    case "variety": return "variety";
    case "producer": return "producer";
    case "region": return "region";
    case "notesRequired":
    case "notes": return "notes";
    case "harvest": return "harvestYear";
    case "altitude": {
      const min = d.altitudeMin.replace(/[,，\s]/g, "");
      return /^\d+$/.test(min) && Number(min) <= 6000 ? "altitudeMax" : "altitudeMin";
    }
    default:
      if (!d.name.trim()) return "name";
      if (!d.originCountryId) return "origin";
      if (!d.processingMethodId) return "process";
      // Only a stale or tampered form gets here (maxLength stops over-long text; the roast list is fixed).
      return "name";
  }
}
