"use client";

import { LIMITS, taipeiYear } from "@/lib/dashboard/validate";
import { t, type Locale } from "@/lib/i18n/dict";
import { Input } from "@/components/ui";
import { FIELD_LABEL } from "@/lib/ui";

export interface ProvenanceValues {
  producer: string;
  region: string;
  altitudeMin: string;
  altitudeMax: string;
}

/** Controlled when `values` + `onChange` are given (edit form); otherwise named inputs read with FormData. */
function binder<K extends string>(values?: Record<K, string>, onChange?: (patch: Partial<Record<K, string>>) => void) {
  return (key: K) =>
    values && onChange
      ? {
          name: key,
          value: values[key],
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange({ [key]: e.target.value } as Partial<Record<K, string>>),
        }
      : { name: key, defaultValue: "" };
}

/**
 * Producer, region and altitude for the coffee forms' Essentials: required
 * since the owner's answer on #176 (only the highest altitude is optional).
 */
export function ProvenanceFields({
  locale,
  values,
  onChange,
}: {
  locale: Locale;
  values?: ProvenanceValues;
  onChange?: (patch: Partial<ProvenanceValues>) => void;
}) {
  const bind = binder<keyof ProvenanceValues>(values, onChange);

  return (
    <fieldset className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
      <legend className="mb-2 text-sm font-semibold text-ink">{t(locale, "cf.provenance")}</legend>
      <label className={FIELD_LABEL}>
        {t(locale, "cf.producer")} *
        <Input
          {...bind("producer")}
          required
          maxLength={LIMITS.provenance}
          placeholder={t(locale, "cf.producerPlaceholder")}
          className="mt-1"
        />
      </label>
      <label className={FIELD_LABEL}>
        {t(locale, "cf.region")} *
        <Input
          {...bind("region")}
          required
          maxLength={LIMITS.provenance}
          placeholder={t(locale, "cf.regionPlaceholder")}
          className="mt-1"
        />
      </label>
      <label className={FIELD_LABEL}>
        {t(locale, "cf.altitudeMin")} *
        <Input {...bind("altitudeMin")} required inputMode="numeric" placeholder="1800" className="mt-1" />
      </label>
      <label className={FIELD_LABEL}>
        {t(locale, "cf.altitudeMax")}
        <Input {...bind("altitudeMax")} inputMode="numeric" placeholder="2100" className="mt-1" />
      </label>
      <p className="-mt-2 text-xs text-muted sm:col-span-2">{t(locale, "cf.altitudeHint")}</p>
    </fieldset>
  );
}

/** The harvest year (optional), under "More details". Controlled like ProvenanceFields. */
export function HarvestYearField({
  locale,
  values,
  onChange,
}: {
  locale: Locale;
  values?: { harvestYear: string };
  onChange?: (patch: Partial<{ harvestYear: string }>) => void;
}) {
  const bind = binder<"harvestYear">(values, onChange);
  return (
    <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
      <label className={FIELD_LABEL}>
        {t(locale, "cf.harvestYear")}
        <Input
          {...bind("harvestYear")}
          inputMode="numeric"
          maxLength={4}
          placeholder={String(taipeiYear() - 1)}
          className="mt-1"
        />
      </label>
      <p className="self-end text-xs text-muted">{t(locale, "cf.harvestHint")}</p>
    </div>
  );
}
