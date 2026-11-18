// Pure state updates for the coffee editor (VariantManager). Every update takes the
// CURRENT state, never one captured in a render, so two saves that finish out of
// order can't put back what the other one changed (#387).
import type { DashboardVariant, EditableCoffee } from "./queries";

export type EditorLoad<C = EditableCoffee> =
  | { state: "loading" }
  | { state: "missing" }
  | { state: "error" }
  | { state: "ready"; coffee: C };

type WithVariants = { variants: DashboardVariant[] };

/** Replace one saved option in the current state; any other state is left alone. */
export function replaceVariant<C extends WithVariants>(cur: EditorLoad<C>, v: DashboardVariant): EditorLoad<C> {
  if (cur.state !== "ready") return cur;
  return { state: "ready", coffee: { ...cur.coffee, variants: cur.coffee.variants.map((x) => (x.id === v.id ? v : x)) } };
}

/** Merge saved coffee fields (everything but the options) into the current state. */
export function mergeCoffeeFields<C extends WithVariants>(cur: EditorLoad<C>, fields: Partial<Omit<C, "variants">>): EditorLoad<C> {
  if (cur.state !== "ready") return cur;
  return { state: "ready", coffee: { ...cur.coffee, ...fields } };
}

/**
 * The state after a reload finishes. Only the first load may replace the page
 * with an error; once the editor is showing, a failed reload keeps it (and its
 * unsaved input) and the caller shows an inline error instead.
 */
export function afterReload<C>(cur: EditorLoad<C>, next: EditorLoad<C>): EditorLoad<C> {
  return next.state === "error" && cur.state === "ready" ? cur : next;
}
