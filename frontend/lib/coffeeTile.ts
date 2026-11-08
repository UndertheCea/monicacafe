// Colour tiles for coffees without a photo (#111), after SEY's collection page: a solid, soft square
// with the coffee's words written on it in black.
//
// Colours are steps 4–8 of Radix Colors' light scales (https://www.radix-ui.com/colors), copied from
// @radix-ui/colors 3.0.0 — MIT License, Copyright (c) 2021 Radix. Steps 4–8 are the soft background /
// border steps, so black text on them stays well above WCAG AA (tests/coffeeTile.test.mjs checks).
// This is the only colour in the UI besides error red (see app/globals.css).

export const TILE_STEPS = [4, 5, 6, 7, 8] as const;
export type TileStep = (typeof TILE_STEPS)[number];

/** Radix light scales, steps 4, 5, 6, 7, 8 in that order. */
export const RADIX_TILES = {
  tomato: ["#ffdcd3", "#ffcdc2", "#fdbdaf", "#f5a898", "#ec8e7b"],
  pink: ["#fbdcef", "#f6cee7", "#efbfdd", "#e7acd0", "#dd93c2"],
  plum: ["#f7def8", "#f2d1f3", "#e9c2ec", "#deade3", "#cf91d8"],
  violet: ["#ebe4ff", "#e1d9ff", "#d4cafe", "#c2b5f5", "#aa99ec"],
  iris: ["#e6e7ff", "#dadcff", "#cbcdff", "#b8baf8", "#9b9ef0"],
  blue: ["#d5efff", "#c2e5ff", "#acd8fc", "#8ec8f6", "#5eb1ef"],
  sky: ["#d1f0fa", "#bee7f5", "#a9daed", "#8dcae3", "#60b3d7"],
  cyan: ["#caf1f6", "#b5e9f0", "#9ddde7", "#7dcedc", "#3db9cf"],
  teal: ["#ccf3ea", "#b8eae0", "#a1ded2", "#83cdc1", "#53b9ab"],
  mint: ["#c8f4e9", "#b3ecde", "#9ce0d0", "#7ecfbd", "#4cbba5"],
  green: ["#d6f1df", "#c4e8d1", "#adddc0", "#8eceaa", "#5bb98b"],
  grass: ["#daf1db", "#c9e8ca", "#b2ddb5", "#94ce9a", "#65ba74"],
  lime: ["#e2f0bd", "#d3e7a6", "#c2da91", "#abc978", "#8db654"],
  amber: ["#ffee9c", "#fbe577", "#f3d673", "#e9c162", "#e2a336"],
  orange: ["#ffdfb5", "#ffd19a", "#ffc182", "#f5ae73", "#ec9455"],
  brown: ["#f0e4d9", "#ebdaca", "#e4cdb7", "#dcbc9f", "#cea37e"],
  gray: ["#e8e8e8", "#e0e0e0", "#d9d9d9", "#cecece", "#bbbbbb"],
} as const satisfies Record<string, readonly string[]>;

export type TileHue = keyof typeof RADIX_TILES;
export const TILE_HUES = Object.keys(RADIX_TILES) as TileHue[];

export interface CoffeeTileColor {
  hue: TileHue;
  step: TileStep;
  /** CSS colour for the tile background. */
  background: string;
}

/** FNV-1a (32-bit): small, stable across runtimes, and spreads similar UUIDs well. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The tile colour for a coffee, picked deterministically from its id: the same coffee always gets the
 * same colour on every page, and neighbours on a grid usually differ (17 hues × 5 steps).
 */
export function coffeeTile(id: string): CoffeeTileColor {
  const h = fnv1a(id);
  const hue = TILE_HUES[h % TILE_HUES.length];
  const stepIndex = Math.floor(h / TILE_HUES.length) % TILE_STEPS.length;
  return { hue, step: TILE_STEPS[stepIndex], background: RADIX_TILES[hue][stepIndex] };
}

/**
 * The small lines written under the coffee's name, SEY-style: variety · process, then origin.
 * Shown uppercase and letter-spaced by CSS (`label-caps`), so the strings stay as the seller / catalogue
 * wrote them. Empty parts are dropped.
 */
export function tileLines(parts: { variety?: string | null; process?: string | null; origin?: string | null }): string[] {
  const clean = (s: string | null | undefined) => (s ?? "").trim();
  const first = [clean(parts.variety), clean(parts.process)].filter(Boolean).join(" · ");
  return [first, clean(parts.origin)].filter(Boolean);
}
