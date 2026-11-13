// Per-field form errors (#232). Pure, so `npm test` can load it (tests/formErrors.test.mjs).
//
// A refused form shows each problem under its field, a one-line summary at the top that links to the first
// problem, and moves focus there. Problems come from two places: the form's own checks (a field name it already
// knows) and the API's `extensions.field` (lib/errors.ts), whose names don't always match the form's.

/** A message to show: a t() key plus its placeholders. Typed loosely so this file has no imports. */
export type FieldMessage<K extends string = string> = { key: K; vars?: Record<string, string | number> };

export type FormErrors<F extends string, K extends string = string> = {
  /** Problems tied to a field, shown under it. */
  fields: Partial<Record<F, FieldMessage<K>>>;
  /** A problem with no field (network, rate limit, conflict): shown in the summary. */
  form?: FieldMessage<K>;
};

export function noErrors<F extends string, K extends string = string>(): FormErrors<F, K> {
  return { fields: {} };
}

export function hasErrors(e: FormErrors<string>): boolean {
  return !!e.form || Object.values(e.fields).some(Boolean);
}

/**
 * The form field an API field name belongs to: the name itself when the form has such a field, else an alias
 * (API `input.priceTwd` / `priceTwd` → form `price`), else undefined (the error goes to the summary).
 * Dotted paths match on their last segment.
 */
export function formFieldFor<F extends string>(
  apiField: string | undefined,
  fields: readonly F[],
  aliases: Readonly<Record<string, F>> = {},
): F | undefined {
  if (!apiField) return undefined;
  const last = apiField.split(".").pop() ?? apiField;
  for (const name of [apiField, last]) {
    if ((fields as readonly string[]).includes(name)) return name as F;
    if (name in aliases) return aliases[name];
  }
  return undefined;
}

/** One problem placed where it belongs: under `field` when the form has it, else in the summary. */
export function placeError<F extends string, K extends string>(
  field: string | undefined,
  message: FieldMessage<K>,
  fields: readonly F[],
  aliases: Readonly<Record<string, F>> = {},
): FormErrors<F, K> {
  const f = formFieldFor(field, fields, aliases);
  return f ? { fields: { [f]: message } as Partial<Record<F, FieldMessage<K>>> } : { fields: {}, form: message };
}

/** The first field with a problem, in the form's visual order. */
export function firstInvalid<F extends string>(order: readonly F[], e: FormErrors<F>): F | undefined {
  return order.find((f) => !!e.fields[f]);
}

/** The DOM id of a form's field: `${formId}-${field}`. Labels, errors and focus all use it. */
export function fieldDomId(formId: string, field: string): string {
  return `${formId}-${field}`;
}

/** Scroll behaviour for jumping to a problem: none of the animation when the visitor asked for reduced motion. */
export function scrollBehavior(prefersReducedMotion: boolean): "auto" | "smooth" {
  return prefersReducedMotion ? "auto" : "smooth";
}
