"use client";

import { LIMITS } from "@/lib/dashboard/validate";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { inputCls } from "./ui";

/** The message keys that belong under the flavour-notes input. */
export const NOTES_ERROR_KEYS: readonly MessageKey[] = ["cf.error.notesRequired", "cf.error.notes"];

/**
 * The required flavour-notes input (#181) for both coffee forms. Controlled
 * when `value` + `onChange` are given (edit form); otherwise a plain named
 * input read with FormData (new-coffee form). `error` is shown inline under the
 * input when it is one of NOTES_ERROR_KEYS.
 */
export function FlavorNotesField({
  locale,
  value,
  onChange,
  error,
}: {
  locale: Locale;
  value?: string;
  onChange?: (v: string) => void;
  error?: MessageKey | null;
}) {
  const bind =
    value !== undefined && onChange
      ? { value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value) }
      : { defaultValue: "" };
  const inline = error && NOTES_ERROR_KEYS.includes(error) ? error : null;
  return (
    <label className="block text-sm font-medium text-neutral-700 sm:col-span-2">
      {t(locale, "cf.flavorNotes")} *
      <input
        name="notes"
        {...bind}
        required
        aria-invalid={inline ? true : undefined}
        aria-describedby="flavor-notes-hint"
        placeholder={t(locale, "filter.flavorPlaceholder")}
        className={inputCls}
      />
      <span id="flavor-notes-hint" className="mt-1 block text-xs font-normal text-neutral-500">
        {t(locale, "cf.flavorHint", { max: LIMITS.flavorNotes })}
      </span>
      {inline && (
        <span className="mt-1 block text-xs font-normal text-red-600">
          {t(locale, inline, { max: LIMITS.flavorNotes, len: LIMITS.flavorNote })}
        </span>
      )}
    </label>
  );
}
