"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { FILTER_OPTIONS, ROAST_LEVELS } from "@/lib/api";
import { UPDATE_COFFEE, type EditableCoffee } from "@/lib/dashboard/queries";
import {
  LIMITS,
  coffeeDetailsPatch,
  coffeeDetailsProblem,
  parseFlavorNotes,
  type CoffeeDetails,
} from "@/lib/dashboard/validate";
import { query, toApiError } from "@/lib/graphql";
import { pick, t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { FormError, Notice, inputCls } from "./ui";

type Options = Awaited<ReturnType<typeof loadOptions>>;
const loadOptions = () => query(FILTER_OPTIONS);

export function detailsOf(c: Pick<EditableCoffee, "name" | "description" | "originCountry" | "processingMethod" | "variety" | "roastLevel" | "flavorNotes">): CoffeeDetails {
  return {
    name: c.name,
    description: c.description,
    originCountryId: c.originCountry.id,
    processingMethodId: c.processingMethod.id,
    varietyId: c.variety?.id ?? null,
    roastLevel: c.roastLevel,
    flavorNotes: c.flavorNotes,
  };
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
    if (problem) return setMsg({ ok: false, key: problem === "notes" ? "cf.error.notes" : "cf.error.required" });
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
      const code = toApiError(err).code;
      setMsg({ ok: false, key: code === "FORBIDDEN" ? "cf.notYours" : code === "BAD_USER_INPUT" ? "cf.error.required" : "cf.error.generic" });
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
    <label className="block text-sm font-medium text-stone-700">
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
    <form onSubmit={onSubmit} noValidate className="rounded-2xl bg-white p-4 ring-1 ring-stone-200 sm:p-6">
      <h3 className="font-bold text-stone-900">{t(locale, "cf.details")}</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-stone-700 sm:col-span-2">
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
          "cf.variety",
          draft.varietyId ?? "",
          (v) => set({ varietyId: v || null }),
          opts.coffeeVarieties.map((o) => ({ id: o.id, label: o.name })),
          false,
        )}
        {select(
          "cf.roast",
          draft.roastLevel,
          (v) => set({ roastLevel: v as typeof draft.roastLevel }),
          ROAST_LEVELS.map((r) => ({ id: r, label: t(locale, `roast.${r}`) })),
        )}
        <label className="block text-sm font-medium text-stone-700 sm:col-span-2">
          {t(locale, "cf.flavorNotes")}
          <input
            value={draft.notes}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder={t(locale, "filter.flavorPlaceholder")}
            className={inputCls}
          />
          <span className="mt-1 block text-xs font-normal text-stone-500">
            {t(locale, "cf.flavorHint", { max: LIMITS.flavorNotes })}
          </span>
        </label>
        <label className="block text-sm font-medium text-stone-700 sm:col-span-2">
          {t(locale, "cf.description")}
          <textarea
            value={draft.description}
            onChange={(e) => set({ description: e.target.value })}
            rows={5}
            maxLength={LIMITS.coffeeDescription}
            className={inputCls}
          />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={busy || !dirty}
          className="rounded-full bg-stone-900 px-5 py-2 text-sm font-semibold text-white hover:bg-stone-700 disabled:opacity-40"
        >
          {busy ? t(locale, "cf.saving") : t(locale, "cf.saveDetails")}
        </button>
        {msg && (
          msg.ok ? (
            <p role="status" className="text-sm text-emerald-700">
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
