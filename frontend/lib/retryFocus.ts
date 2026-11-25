// Where focus goes after "Try again" (#512). Pure, no imports, so `npm test` can load it.
//
// "Try again" swaps the failed state for a loading one, which unmounts the button: focus falls to <body>. While the
// section reloads, focus waits on its heading; if the retry fails again, it moves to the new "Try again". A visitor
// who moved focus anywhere else keeps their place.

export type RetryFocusStep = "retry" | "heading" | "wait" | "stop";

/**
 * One step, run whenever the section changes. `focusLost`: focus is on <body> (or a detached node);
 * `onHeading`: focus is on the heading this helper put it on; `hasRetry`: a new "Try again" is on screen.
 */
export function retryFocusStep(s: { focusLost: boolean; onHeading: boolean; hasRetry: boolean }): RetryFocusStep {
  if (s.focusLost) return s.hasRetry ? "retry" : "heading";
  if (s.onHeading) return s.hasRetry ? "retry" : "wait";
  return "stop";
}
