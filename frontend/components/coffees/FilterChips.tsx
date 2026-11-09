import Link from "next/link";
import { priceChipLabel, type FilterChip } from "@/lib/filterChips";
import { t, type Locale } from "@/lib/i18n/dict";

interface Props {
  locale: Locale;
  chips: FilterChip[];
  /** Display names for origin / variety / process ids (missing → just the field name). */
  names?: Map<string, string>;
  /** "Clear all" target, shown when two or more filters are active. */
  clearHref: string;
}

const FIELD = {
  origin: "filter.origin",
  variety: "filter.variety",
  process: "filter.process",
} as const;

/** The visible text of one chip. */
export function chipLabel(locale: Locale, c: FilterChip, names?: Map<string, string>): string {
  const labelled = (field: keyof typeof FIELD, value: string) =>
    t(locale, "chip.labelled", { label: t(locale, FIELD[field]), value });
  switch (c.kind) {
    case "origin":
    case "variety":
    case "process": {
      const name = names?.get(c.id);
      return name ? labelled(c.kind, name) : t(locale, FIELD[c.kind]);
    }
    case "price": {
      const { key, vars } = priceChipLabel(c.min, c.max);
      return t(locale, key, vars);
    }
    case "instock":
      return t(locale, "filter.inStock");
  }
}

// Plain links (no JavaScript): each drops one filter and returns to page 1.
export function FilterChips({ locale, chips, names, clearHref }: Props) {
  if (chips.length === 0) return null;
  return (
    <nav aria-label={t(locale, "chip.active")} className="mb-4">
      <ul className="flex flex-wrap items-center gap-2">
        {chips.map((c) => {
          const label = chipLabel(locale, c, names);
          return (
            <li key={c.kind}>
              <Link
                href={c.href}
                aria-label={t(locale, "chip.remove", { label })}
                className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3 py-1 text-sm text-neutral-800 transition hover:border-ink"
              >
                {label}
                <span aria-hidden="true" className="text-neutral-500">
                  ×
                </span>
              </Link>
            </li>
          );
        })}
        {chips.length > 1 && (
          <li>
            <Link href={clearHref} className="px-1 text-sm font-semibold text-ink underline-offset-4 hover:underline">
              {t(locale, "chip.clearAll")}
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}
