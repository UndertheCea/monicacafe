"use client";

import { ErrorSummary } from "@/components/ui";
import { fieldDomId, type FormErrors } from "@/lib/formErrors";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";

/** The translated message of one field's error, for `<Field error>`; undefined when the field is fine. */
export function fieldMessage<F extends string>(locale: Locale, errors: FormErrors<F>, field: F) {
  const m = errors.fields[field];
  return m ? t(locale, m.key as MessageKey, m.vars as Record<string, number> | undefined) : undefined;
}

/**
 * The summary banner above a refused form (#232): the form-level message when there is one, else
 * "N fields to fix" with a link to the first problem. Renders nothing while the form is fine.
 */
export function FormSummary<F extends string>({
  formId,
  locale,
  errors,
  order,
}: {
  formId: string;
  locale: Locale;
  errors: FormErrors<F>;
  /** The form's fields in visual order. */
  order: readonly F[];
}) {
  const first = order.find((f) => !!errors.fields[f]);
  if (!errors.form && !first) return null;
  const n = Object.values(errors.fields).filter(Boolean).length;
  return (
    <ErrorSummary
      formId={formId}
      message={
        errors.form
          ? t(locale, errors.form.key as MessageKey, errors.form.vars as Record<string, number> | undefined)
          : t(locale, "form.fixFields", { n })
      }
      firstFieldId={first && fieldDomId(formId, first)}
      jumpLabel={first && t(locale, "form.jumpFirst")}
    />
  );
}
