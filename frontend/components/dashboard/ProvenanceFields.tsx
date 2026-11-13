"use client";

import { LIMITS, taipeiYear } from "@/lib/dashboard/validate";
import { t, type Locale } from "@/lib/i18n/dict";
import { Field, Input } from "@/components/ui";
import { fieldMessage } from "@/components/FormSummary";
import type { CoffeeFormErrors } from "./coffeeFormErrors";

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
  fe,
  values,
  onChange,
}: {
  locale: Locale;
  fe: CoffeeFormErrors;
  values?: ProvenanceValues;
  onChange?: (patch: Partial<ProvenanceValues>) => void;
}) {
  const bind = binder<keyof ProvenanceValues>(values, onChange);
  const err = (f: "producer" | "region" | "altitudeMin" | "altitudeMax") => fieldMessage(locale, fe.errors, f);

  return (
    <fieldset className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
      <legend className="mb-2 text-sm font-semibold text-ink">{t(locale, "cf.provenance")}</legend>
      <Field id={fe.id("producer")} label={`${t(locale, "cf.producer")} *`} error={err("producer")}>
        {(p) => (
          <Input
            {...bind("producer")}
            {...p}
            required
            maxLength={LIMITS.provenance}
            placeholder={t(locale, "cf.producerPlaceholder")}
          />
        )}
      </Field>
      <Field id={fe.id("region")} label={`${t(locale, "cf.region")} *`} error={err("region")}>
        {(p) => (
          <Input
            {...bind("region")}
            {...p}
            required
            maxLength={LIMITS.provenance}
            placeholder={t(locale, "cf.regionPlaceholder")}
          />
        )}
      </Field>
      <Field id={fe.id("altitudeMin")} label={`${t(locale, "cf.altitudeMin")} *`} error={err("altitudeMin")}>
        {(p) => <Input {...bind("altitudeMin")} {...p} required inputMode="numeric" placeholder="1800" />}
      </Field>
      <Field id={fe.id("altitudeMax")} label={t(locale, "cf.altitudeMax")} error={err("altitudeMax")}>
        {(p) => <Input {...bind("altitudeMax")} {...p} inputMode="numeric" placeholder="2100" />}
      </Field>
      <p className="-mt-2 text-xs text-muted sm:col-span-2">{t(locale, "cf.altitudeHint")}</p>
    </fieldset>
  );
}

/** The harvest year (optional), under "More details". Controlled like ProvenanceFields. */
export function HarvestYearField({
  locale,
  fe,
  values,
  onChange,
}: {
  locale: Locale;
  fe: CoffeeFormErrors;
  values?: { harvestYear: string };
  onChange?: (patch: Partial<{ harvestYear: string }>) => void;
}) {
  const bind = binder<"harvestYear">(values, onChange);
  return (
    <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
      <Field
        id={fe.id("harvestYear")}
        label={t(locale, "cf.harvestYear")}
        error={fieldMessage(locale, fe.errors, "harvestYear")}
      >
        {(p) => (
          <Input
            {...bind("harvestYear")}
            {...p}
            inputMode="numeric"
            maxLength={4}
            placeholder={String(taipeiYear() - 1)}
          />
        )}
      </Field>
      <p className="self-end text-xs text-muted">{t(locale, "cf.harvestHint")}</p>
    </div>
  );
}
