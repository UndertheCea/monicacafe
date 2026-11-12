// The design system's class recipes (#230). Every button, field, card, heading and badge on the site is built from
// these strings, through the components in components/ui/. Restyling a control is a change here, not a grep.
// Pure (no React), so `npm test` can check them (tests/ui.test.mjs).
//
// Rules the recipes follow:
// - Buttons and pills are `rounded-full`; cards and fields use the one box radius (`rounded-box`, globals.css).
// - Focus is the global 2 px ink outline from globals.css. No recipe sets `outline-none` or a focus ring.
// - Only the colour tokens (ink / muted / faint / line / paper / danger) appear.

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "md" | "sm";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

/** md is 44 px tall (the tap-target minimum, #231); sm is 36 px, for dense rows inside a list. */
const BUTTON_SIZES: Record<ButtonSize, string> = {
  md: "min-h-11 px-5 text-sm",
  sm: "min-h-9 px-3 text-sm",
};

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white hover:bg-ink/80",
  secondary: "bg-white text-ink ring-1 ring-line hover:ring-ink",
  quiet: "text-muted hover:bg-paper hover:text-ink",
  danger: "bg-white text-danger ring-1 ring-danger/30 hover:bg-danger/10",
};

export const BUTTON_VARIANT_NAMES = Object.keys(BUTTON_VARIANTS) as ButtonVariant[];

function join(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** Classes for a button or a link styled as one. `full` stretches it to the container's width. */
export function buttonClass({
  variant = "primary",
  size = "md",
  full = false,
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; full?: boolean; className?: string } = {}): string {
  return join(BUTTON_BASE, BUTTON_SIZES[size], BUTTON_VARIANTS[variant], full && "w-full", className);
}

/** A round icon-only button (☰, ×, ↑ / ↓): 44 × 44 px, outlined. */
export const ICON_BUTTON =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-white text-ink transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-line";

/**
 * Text inputs, selects and textareas. 44 px tall; the border turns red when `aria-invalid` is set, so a field marked
 * invalid by `Field` looks invalid without extra classes.
 */
export const FIELD_CONTROL =
  "block w-full min-h-11 rounded-box border border-line bg-white px-3 py-2 text-base text-ink placeholder:text-faint disabled:bg-paper disabled:text-faint aria-[invalid=true]:border-danger";

/** A pill-shaped search box (header, /coffees, /shops): the same control with full rounding. */
export const SEARCH_CONTROL = FIELD_CONTROL.replace("rounded-box", "rounded-full");

/** A white card: hairline ring and the box radius, flat. Padding is the caller's (p-4 lists, p-6 panels). */
export const CARD = "rounded-box bg-white ring-1 ring-line";

/** The one page heading. */
export const PAGE_TITLE = "text-3xl font-bold leading-tight text-ink";

/** A section heading inside a page. */
export const SECTION_TITLE = "text-xl font-bold text-ink";

/** Small caps label (globals.css `.label-caps`: Latin is spaced out, Chinese isn't). */
export const LABEL = "label-caps text-muted";

/** Field label above a control. */
export const FIELD_LABEL = "block text-sm font-medium text-ink";

export type BadgeTone = "solid" | "outline" | "soft" | "danger";

const BADGE_TONES: Record<BadgeTone, string> = {
  solid: "bg-ink text-white ring-1 ring-ink",
  outline: "bg-white text-ink ring-1 ring-ink",
  soft: "bg-paper text-muted ring-1 ring-line",
  danger: "bg-danger/10 text-danger ring-1 ring-danger/30",
};

/** A small status pill ("草稿", "已售完", "店家"). */
export function badgeClass(tone: BadgeTone = "soft", className?: string): string {
  return join("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", BADGE_TONES[tone], className);
}

/** ids for a field's hint and error, so `aria-describedby` and the elements agree. */
export function fieldIds(id: string): { hint: string; error: string } {
  return { hint: `${id}-hint`, error: `${id}-error` };
}

/** The `aria-describedby` value for a field: error first (read first), then the hint; undefined when neither. */
export function describedBy(id: string, hasHint: boolean, hasError: boolean): string | undefined {
  const ids = fieldIds(id);
  const parts = [hasError && ids.error, hasHint && ids.hint].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}
