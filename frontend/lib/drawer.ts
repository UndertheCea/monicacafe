// Side drawer helpers (#165, shared with the navigation drawer #175). No
// imports, so `npm test` can load it directly.

/**
 * Tailwind's `md` breakpoint in px. Below it /coffees folds its filters into a
 * drawer; from it up the sidebar is always shown. Keep in step with the `md:`
 * classes in FilterPanel.
 */
export const DRAWER_BREAKPOINT_PX = 768;

/** The media query for "the sidebar is shown inline, so no drawer". */
export const INLINE_SIDEBAR_QUERY = `(min-width: ${DRAWER_BREAKPOINT_PX}px)`;

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Whether a click at (x, y) landed outside the drawer panel's box, i.e. on the
 * dimmed backdrop (a modal <dialog> reports backdrop clicks as clicks on
 * itself). Points on the edge count as inside. Keyboard "clicks" arrive at
 * (0, 0) on some browsers, so callers only use this for pointer events.
 */
export function isOutside(box: Box, x: number, y: number): boolean {
  return x < box.left || x > box.right || y < box.top || y > box.bottom;
}
