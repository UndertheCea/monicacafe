"use client";

import { CUP_MAX, CUP_MIN, CUP_SCALES, type CupScale } from "@/lib/cupProfile";
import { t, type Locale } from "@/lib/i18n/dict";
import { inputCls } from "./ui";

export type CupProfileValues = Record<CupScale, string>;

const LEVELS = Array.from({ length: CUP_MAX - CUP_MIN + 1 }, (_, i) => CUP_MIN + i);

/**
 * Acidity / sweetness / body selects (1–5, blank = not given) for the coffee
 * forms. Controlled when `values` + `onChange` are given (edit form);
 * otherwise plain named selects read with FormData (new-coffee form).
 */
export function CupProfileFields({
  locale,
  values,
  onChange,
}: {
  locale: Locale;
  values?: CupProfileValues;
  onChange?: (patch: Partial<CupProfileValues>) => void;
}) {
  const bind = (key: CupScale) =>
    values && onChange
      ? { name: key, value: values[key], onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onChange({ [key]: e.target.value }) }
      : { name: key, defaultValue: "" };

  return (
    <fieldset className="grid gap-4 sm:col-span-2 sm:grid-cols-3">
      <legend className="mb-2 text-sm font-semibold text-ink">{t(locale, "cf.cupProfile")}</legend>
      {CUP_SCALES.map((scale) => (
        <label key={scale} className="block text-sm font-medium text-neutral-700">
          {t(locale, `cup.${scale}`)}
          <select {...bind(scale)} className={inputCls}>
            <option value="">{t(locale, "cf.none")}</option>
            {LEVELS.map((n) => (
              <option key={n} value={String(n)}>
                {n === CUP_MIN ? t(locale, "cf.cupLow", { n }) : n === CUP_MAX ? t(locale, "cf.cupHigh", { n }) : String(n)}
              </option>
            ))}
          </select>
        </label>
      ))}
      <p className="-mt-2 text-xs text-neutral-500 sm:col-span-3">{t(locale, "cf.cupHint")}</p>
    </fieldset>
  );
}
