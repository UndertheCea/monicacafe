"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { BREW_METHODS, FILTER_OPTIONS, ROAST_LEVELS } from "@/lib/api";
import { UPDATE_COFFEE, type EditableCoffee } from "@/lib/dashboard/queries";
import {
  LIMITS,
  coffeeDetailsPatch,
  apiDetailsProblem,
  coffeeDetailsProblem,
  filledOptionalCount,
  isOptionalProblem,
  parseFlavorNotes,
  type CoffeeDetails,
  type CoffeeDetailsProblem,
} from "@/lib/dashboard/validate";
import { brewLongKey } from "@/lib/brew";
import { query, toApiError } from "@/lib/graphql";
import { pick, t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { CupProfileFields } from "./CupProfileFields";
import { FlavorNotesField } from "./FlavorNotesField";
import { MoreDetails } from "./MoreDetails";
import { ProvenanceFields } from "./ProvenanceFields";
import { FormError, Notice, inputCls } from "./ui";

type Options = Awaited<ReturnType<typeof loadOptions>>;
const loadOptions = () => query(FILTER_OPTIONS);

type DetailFields =
  | "name" | "description" | "originCountry" | "processingMethod" | "variety" | "roastLevel" | "flavorNotes"
  | "producer" | "region" | "altitudeMinM" | "altitudeMaxM" | "brewMethod" | "harvestYear"
  | "acidity" | "sweetness" | "body";

export function detailsOf(c: Pick<EditableCoffee, DetailFields>): CoffeeDetails {
  return {
    name: c.name,
    description: c.description,
    originCountryId: c.originCountry.id,
    processingMethodId: c.processingMethod.id,
    varietyId: c.variety?.id ?? null,
    roastLevel: c.roastLevel,
    flavorNotes: c.flavorNotes,
    producer: c.producer,
    region: c.region,
    altitudeMin: c.altitudeMinM === null ? "" : String(c.altitudeMinM),
    altitudeMax: c.altitudeMaxM === null ? "" : String(c.altitudeMaxM),
    brewMethod: c.brewMethod ?? null,
    harvestYear: c.harvestYear == null ? "" : String(c.harvestYear),
    acidity: c.acidity == null ? "" : String(c.acidity),
    sweetness: c.sweetness == null ? "" : String(c.sweetness),
    body: c.body == null ? "" : String(c.body),
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
  if (problem === "altitude") return "cf.error.altitude";
  if (problem === "harvest") return "cf.error.harvest";
  if (problem === "cup") return "cf.error.cup";
  return "cf.error.required";
}

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
  const [msg, setMsg] = useState<{ ok: boolean; key: MessageKey } | null>(null);
  // Folded unless the coffee already has optional details (#182).
  const [moreOpen, setMoreOpen] = useState(() => filledOptionalCount(saved) > 0);

  useEffect(() => {
    loadOptions().then(setOpts, () => setOptsFailed(true));
  }, []);

  if (optsFailed) return <Notice>{t(locale, "error.title")}</Notice>;
  if (!opts) return <Notice>{t(locale, "dash.loading")}</Notice>;

  const next: CoffeeDetails = { ...draft, flavorNotes: parseFlavorNotes(draft.notes) };
  const patch = coffeeDetailsPatch(saved, next);
  const dirty = Object.keys(patch).length > 0;
  const set = (p: Partial<typeof draft>) => {
    setDraft((d) => ({ ...d, ...p }));
    setMsg(null);
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = coffeeDetailsProblem(next, ROAST_LEVELS);
    if (problem) {
      if (isOptionalProblem(problem)) setMoreOpen(true);
      return setMsg({ ok: false, key: detailsErrorKey(problem) });
    }
    if (!dirty) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await request(UPDATE_COFFEE, { id: coffee.id, input: patch });
      onSaved(r.updateCoffee);
      const s = detailsOf(r.updateCoffee);
      setDraft({ ...s, notes: s.flavorNotes.join(", ") });
      setMsg({ ok: true, key: "cf.saved" });
    } catch (err) {
      const { code, field } = toApiError(err);
      const problem = code === "BAD_USER_INPUT" ? apiDetailsProblem(field, next.flavorNotes.length) : null;
      if (isOptionalProblem(problem) || field === "producer" || field === "region") setMoreOpen(true);
      setMsg({
        ok: false,
        key:
          code === "FORBIDDEN"
            ? "cf.notYours"
            : problem
              ? detailsErrorKey(problem)
              : "cf.error.generic",
      });
    } finally {
      setBusy(false);
    }
  }

  const select = (
    label: MessageKey,
    value: string,
    onChange: (v: string) => void,
    items: { id: string; label: string }[],
    required = true,
  ) => (
    <label className="block text-sm font-medium text-neutral-700">
      {t(locale, label)}
      {required && " *"}
      <select value={value} onChange={(e) => onChange(e.target.value)} required={required} className={inputCls}>
        <option value="">{t(locale, required ? "cf.choose" : "cf.none")}</option>
        {items.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="rounded-2xl bg-white p-4 ring-1 ring-neutral-200 sm:p-6">
      <h3 className="font-bold text-ink">{t(locale, "cf.essentials")}</h3>
      <p className="mt-1 text-sm text-neutral-500">{t(locale, "cf.essentialsHint")}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-neutral-700 sm:col-span-2">
          {t(locale, "cf.name")} *
          <input
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            required
            maxLength={LIMITS.coffeeName}
            className={inputCls}
          />
        </label>
        {select(
          "cf.origin",
          draft.originCountryId,
          (v) => set({ originCountryId: v }),
          opts.originCountries.map((o) => ({ id: o.id, label: pick(locale, o.nameZh, o.nameEn) })),
        )}
        {select(
          "cf.process",
          draft.processingMethodId,
          (v) => set({ processingMethodId: v }),
          opts.processingMethods.map((o) => ({ id: o.id, label: pick(locale, o.nameZh, o.nameEn) })),
        )}
        {select(
          "cf.roast",
          draft.roastLevel,
          (v) => set({ roastLevel: v as typeof draft.roastLevel }),
          ROAST_LEVELS.map((r) => ({ id: r, label: t(locale, `roast.${r}`) })),
        )}
        <FlavorNotesField
          locale={locale}
          value={draft.notes}
          onChange={(notes) => set({ notes })}
          error={msg && !msg.ok ? msg.key : null}
        />
      </div>
      <MoreDetails
        locale={locale}
        filled={filledOptionalCount(next)}
        open={moreOpen}
        onOpenChange={setMoreOpen}
        className="mt-4"
      >
        <label className="block text-sm font-medium text-neutral-700 sm:col-span-2">
          {t(locale, "cf.description")}
          <textarea
            value={draft.description}
            onChange={(e) => set({ description: e.target.value })}
            rows={5}
            maxLength={LIMITS.coffeeDescription}
            className={inputCls}
          />
        </label>
        {select(
          "cf.variety",
          draft.varietyId ?? "",
          (v) => set({ varietyId: v || null }),
          opts.coffeeVarieties.map((o) => ({ id: o.id, label: o.name })),
          false,
        )}
        {select("cf.brew", draft.brewMethod ?? "", (v) => set({ brewMethod: v || null }), brewOptions(locale), false)}
        <ProvenanceFields locale={locale} values={draft} onChange={set} />
        <CupProfileFields locale={locale} values={draft} onChange={set} />
      </MoreDetails>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={busy || !dirty}
          className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          {busy ? t(locale, "cf.saving") : t(locale, "cf.saveDetails")}
        </button>
        {msg && (
          msg.ok ? (
            <p role="status" className="text-sm text-ink">
              {t(locale, msg.key, { max: LIMITS.flavorNotes, len: LIMITS.flavorNote })}
            </p>
          ) : (
            <FormError>{t(locale, msg.key, { max: LIMITS.flavorNotes, len: LIMITS.flavorNote })}</FormError>
          )
        )}
      </div>
    </form>
  );
}
