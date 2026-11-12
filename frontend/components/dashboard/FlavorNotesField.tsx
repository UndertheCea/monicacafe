"use client";

import { LIMITS } from "@/lib/dashboard/validate";
import { t, type Locale } from "@/lib/i18n/dict";
import { Field, Input } from "@/components/ui";
import { fieldMessage } from "@/components/FormSummary";
import type { CoffeeFormErrors } from "./coffeeFormErrors";

/**
 * The required flavour-notes input (#181) for both coffee forms. Controlled
 * when `value` + `onChange` are given (edit form); otherwise a plain named
 * input read with FormData (new-coffee form). Its error shows under it.
 */
export function FlavorNotesField({
  locale,
  fe,
  value,
  onChange,
}: {
  locale: Locale;
  fe: CoffeeFormErrors;
  value?: string;
  onChange?: (v: string) => void;
}) {
  const bind =
    value !== undefined && onChange
      ? { value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value) }
      : { defaultValue: "" };
  return (
    <Field
      id={fe.id("notes")}
      label={`${t(locale, "cf.flavorNotes")} *`}
      hint={t(locale, "cf.flavorHint", { max: LIMITS.flavorNotes })}
      error={fieldMessage(locale, fe.errors, "notes")}
      className="sm:col-span-2"
    >
      {(p) => (
        <Input
          name="notes"
          {...bind}
          {...p}
          required
          placeholder={t(locale, "filter.flavorPlaceholder")}
        />
      )}
    </Field>
  );
}
