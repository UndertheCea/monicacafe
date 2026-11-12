"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUnsavedChanges } from "./useSellerSession";
import { BREW_METHODS, FILTER_OPTIONS, ROAST_LEVELS } from "@/lib/api";
import { UPDATE_COFFEE, type EditableCoffee } from "@/lib/dashboard/queries";
import {
  LIMITS,
  coffeeDetailsPatch,
  apiDetailsProblem,
  coffeeDetailsProblem,
  filledOptionalCount,
  parseFlavorNotes,
  type CoffeeDetails,
  type CoffeeDetailsProblem,
} from "@/lib/dashboard/validate";
import {
  COFFEE_API_ALIASES,
  COFFEE_ORDER,
  OPTIONAL_ORDER,
  isOptionalField,
  problemField,
} from "@/lib/dashboard/coffeeFields";
import { formFieldFor, placeError, type FormErrors } from "@/lib/formErrors";
import { isContactInfoError } from "@/lib/moderation";
import { FormSummary, fieldMessage } from "@/components/FormSummary";
import type { CoffeeFieldKey } from "./coffeeFormErrors";
import { brewLongKey } from "@/lib/brew";
import { query, toApiError } from "@/lib/graphql";
import { pick, t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { FlavorNotesField } from "./FlavorNotesField";
import { MoreDetails } from "./MoreDetails";
import { HarvestYearField, ProvenanceFields } from "./ProvenanceFields";
import { Notice } from "./ui";
import { Button, Field, Input, Select, Textarea, useFormErrors } from "@/components/ui";
import { CARD } from "@/lib/ui";

type Options = Awaited<ReturnType<typeof loadOptions>>;
const loadOptions = () => query(FILTER_OPTIONS);

const EDIT_ORDER: readonly CoffeeFieldKey[] = [...COFFEE_ORDER, ...OPTIONAL_ORDER];

type DetailFields =
  | "name" | "description" | "originCountry" | "processingMethod" | "variety" | "roastLevel" | "flavorNotes"
  | "producer" | "region" | "altitudeMinM" | "altitudeMaxM" | "brewMethod" | "harvestYear";

export function detailsOf(c: Pick<EditableCoffee, DetailFields>): CoffeeDetails {
  return {
    name: c.name,
    description: c.description,
    originCountryId: c.originCountry.id,
    processingMethodId: c.processingMethod.id,
    varietyId: c.variety?.id ?? null,
    roastLevel: c.roastLevel ?? "",
    flavorNotes: c.flavorNotes,
    producer: c.producer,
    region: c.region,
    altitudeMin: c.altitudeMinM === null ? "" : String(c.altitudeMinM),
    altitudeMax: c.altitudeMaxM === null ? "" : String(c.altitudeMaxM),
    brewMethod: c.brewMethod ?? null,
    harvestYear: c.harvestYear == null ? "" : String(c.harvestYear),
  };
}

/** Brew-method choices for the coffee forms; omni spells out that it suits both. */
export function brewOptions(locale: Locale) {
  return BREW_METHODS.map((m) => ({ id: m, label: t(locale, brewLongKey(m)!) }));
}

/** The message for a coffee-details problem (local check or the API's field). */
export function detailsErrorKey(problem: CoffeeDetailsProblem): MessageKey {
  if (problem === "notesRequired") return "cf.error.notesRequired";
  if (problem === "notes") return "cf.error.notes";
  if (problem === "variety") return "cf.error.variety";
  if (problem === "producer") return "cf.error.producer";
  if (problem === "region") return "cf.error.region";
  if (problem === "altitude") return "cf.error.altitude";
  if (problem === "harvest") return "cf.error.harvest";
  return "cf.error.required";
}

/** API fields whose BAD_USER_INPUT has a message of its own (the rest read "couldn't save" under their field). */
const DETAILS_API_FIELDS = [
  "name", "originCountryId", "processingMethodId", "flavorNotes", "altitudeMinM", "altitudeMaxM",
  "producer", "region", "harvestYear", "varietyId",
];

/**
 * A BAD_USER_INPUT from createCoffee / updateCoffee, placed under the field the API named (aliases in
 * COFFEE_API_ALIASES); a field the form doesn't have goes to the summary. `notesSent`: see apiDetailsProblem.
 */
export function coffeeBadInput(
  field: string | undefined,
  notesSent: number,
  order: readonly CoffeeFieldKey[],
): FormErrors<CoffeeFieldKey> {
  const problem = DETAILS_API_FIELDS.includes(field ?? "") ? apiDetailsProblem(field, notesSent) : null;
  const key = problem ? detailsErrorKey(problem) : "cf.error.generic";
  return placeError(field, { key, vars: { max: LIMITS.flavorNotes, len: LIMITS.flavorNote } }, order, COFFEE_API_ALIASES);
}

/** The message for a client-side details problem. */
export const detailsMessage = (problem: CoffeeDetailsProblem) => ({
  key: detailsErrorKey(problem),
  vars: { max: LIMITS.flavorNotes, len: LIMITS.flavorNote },
});

/** Edit form for a coffee's text fields; saves only what changed via updateCoffee. */
export function CoffeeDetailsForm({
  coffee,
  locale,
  onSaved,
}: {
  coffee: EditableCoffee;
  locale: Locale;
  onSaved: (c: Omit<EditableCoffee, "variants">) => void;
}) {
  const { request } = useAuth();
  const [opts, setOpts] = useState<Options | null>(null);
  const [optsFailed, setOptsFailed] = useState(false);
  const saved = detailsOf(coffee);
  const [draft, setDraft] = useState({ ...saved, notes: saved.flavorNotes.join(", ") });
  const [busy, setBusy] = useState(false);
  const fe = useFormErrors<CoffeeFieldKey>("coffee-edit", EDIT_ORDER);
  const [saveMsg, setSaveMsg] = useState<MessageKey | null>(null);
  // Folded unless the coffee already has optional details (#182).
  const [moreOpen, setMoreOpen] = useState(() => filledOptionalCount(saved) > 0);

  useEffect(() => {
    loadOptions().then(setOpts, () => setOptsFailed(true));
  }, []);

  const unsaved = Object.keys(coffeeDetailsPatch(saved, { ...draft, flavorNotes: parseFlavorNotes(draft.notes) })).length > 0;
  useUnsavedChanges(unsaved && !busy, t(locale, "dash.unsavedConfirm"));

  if (optsFailed) return <Notice>{t(locale, "error.title")}</Notice>;
  if (!opts) return <Notice>{t(locale, "dash.loading")}</Notice>;

  const next: CoffeeDetails = { ...draft, flavorNotes: parseFlavorNotes(draft.notes) };
  const patch = coffeeDetailsPatch(saved, next);
  const dirty = Object.keys(patch).length > 0;
  const set = (p: Partial<typeof draft>) => {
    setDraft((d) => ({ ...d, ...p }));
    setSaveMsg(null);
    for (const k of Object.keys(p)) {
      const f = formFieldFor(k, EDIT_ORDER, COFFEE_API_ALIASES);
      if (f) fe.clearField(f);
    }
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = coffeeDetailsProblem(next, ROAST_LEVELS);
    if (problem) {
      const field = problemField(problem, next);
      if (isOptionalField(field)) setMoreOpen(true);
      return fe.failField(field, detailsMessage(problem));
    }
    if (!dirty) return;
    setBusy(true);
    setSaveMsg(null);
    fe.clear();
    try {
      const r = await request(UPDATE_COFFEE, { id: coffee.id, input: patch });
      onSaved(r.updateCoffee);
      const s = detailsOf(r.updateCoffee);
      setDraft({ ...s, notes: s.flavorNotes.join(", ") });
      setSaveMsg("cf.saved");
    } catch (err) {
      const { code, field } = toApiError(err);
      const failed: FormErrors<CoffeeFieldKey> = isContactInfoError(code)
        ? placeError(field ?? "description", { key: "contact.error" }, EDIT_ORDER, COFFEE_API_ALIASES)
        : code === "BAD_USER_INPUT"
          ? coffeeBadInput(field, next.flavorNotes.length, EDIT_ORDER)
          : { fields: {}, form: { key: code === "FORBIDDEN" ? "cf.notYours" : "cf.error.generic" } };
      const placed = Object.keys(failed.fields)[0];
      if (placed && isOptionalField(placed)) setMoreOpen(true);
      fe.fail(failed);
    } finally {
      setBusy(false);
    }
  }

  const select = (
    field: CoffeeFieldKey,
    label: MessageKey,
    value: string,
    onChange: (v: string) => void,
    items: { id: string; label: string }[],
    required = true,
  ) => (
    <Field
      id={fe.id(field)}
      label={`${t(locale, label)}${required ? " *" : ""}`}
      error={fieldMessage(locale, fe.errors, field)}
    >
      {(p) => (
        <Select {...p} value={value} onChange={(e) => onChange(e.target.value)} required={required}>
          <option value="">{t(locale, required ? "cf.choose" : "cf.none")}</option>
          {items.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );

  return (
    <form onSubmit={onSubmit} noValidate className={`${CARD} p-4 sm:p-6`}>
      <div className="mb-4 empty:hidden">
        <FormSummary formId="coffee-edit" locale={locale} errors={fe.errors} order={EDIT_ORDER} />
      </div>
      <h3 className="font-bold text-ink">{t(locale, "cf.essentials")}</h3>
      <p className="mt-1 text-sm text-muted">{t(locale, "cf.essentialsHint")}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field
          id={fe.id("name")}
          label={`${t(locale, "cf.name")} *`}
          error={fieldMessage(locale, fe.errors, "name")}
          className="sm:col-span-2"
        >
          {(p) => (
            <Input
              {...p}
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
              required
              maxLength={LIMITS.coffeeName}
            />
          )}
        </Field>
        {select(
          "origin",
          "cf.origin",
          draft.originCountryId,
          (v) => set({ originCountryId: v }),
          opts.originCountries.map((o) => ({ id: o.id, label: pick(locale, o.nameZh, o.nameEn) })),
        )}
        {select(
          "process",
          "cf.process",
          draft.processingMethodId,
          (v) => set({ processingMethodId: v }),
          opts.processingMethods.map((o) => ({ id: o.id, label: pick(locale, o.nameZh, o.nameEn) })),
        )}
        {select(
          "variety",
          "cf.variety",
          draft.varietyId ?? "",
          (v) => set({ varietyId: v || null }),
          opts.coffeeVarieties.map((o) => ({ id: o.id, label: o.name })),
        )}
        {select(
          "roast",
          "cf.roast",
          draft.roastLevel,
          (v) => set({ roastLevel: v }),
          ROAST_LEVELS.map((r) => ({ id: r, label: t(locale, `roast.${r}`) })),
          false,
        )}
        <p className="-mt-2 text-xs text-muted sm:col-span-2">{t(locale, "cf.varietyHint")}</p>
        <ProvenanceFields locale={locale} fe={fe} values={draft} onChange={set} />
        <FlavorNotesField locale={locale} fe={fe} value={draft.notes} onChange={(notes) => set({ notes })} />
      </div>
      <MoreDetails
        locale={locale}
        filled={filledOptionalCount(next)}
        open={moreOpen}
        onOpenChange={setMoreOpen}
        className="mt-4"
      >
        <Field
          id={fe.id("description")}
          label={t(locale, "cf.description")}
          hint={t(locale, "contact.hint")}
          error={fieldMessage(locale, fe.errors, "description")}
          className="sm:col-span-2"
        >
          {(p) => (
            <Textarea
              {...p}
              value={draft.description}
              onChange={(e) => set({ description: e.target.value })}
              rows={5}
              maxLength={LIMITS.coffeeDescription}
            />
          )}
        </Field>
        {select("brew", "cf.brew", draft.brewMethod ?? "", (v) => set({ brewMethod: v || null }), brewOptions(locale), false)}
        <HarvestYearField locale={locale} fe={fe} values={draft} onChange={set} />
      </MoreDetails>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Button
          type="submit"
          disabled={busy || !dirty}
        >
          {busy ? t(locale, "cf.saving") : t(locale, "cf.saveDetails")}
        </Button>
        {saveMsg && (
          <p role="status" className="text-sm text-ink">
            {t(locale, saveMsg)}
          </p>
        )}
      </div>
    </form>
  );
}
