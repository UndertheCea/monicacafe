"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { BREW_METHODS, FILTER_OPTIONS, ROAST_LEVELS, type BrewMethod, type GrindOption, type RoastLevel } from "@/lib/api";
import { CREATE_COFFEE } from "@/lib/dashboard/queries";
import {
  LIMITS,
  apiDetailsProblem,
  coffeeDetailsProblem,
  parseAltitude,
  parseHarvestYear,
  parseFlavorNotes,
  parseWhole,
  variantProblems,
  type VariantDraft,
} from "@/lib/dashboard/validate";
import { query, toApiError } from "@/lib/graphql";
import { pick, t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { brewOptions, detailsErrorKey } from "./CoffeeDetailsForm";
import { ProvenanceFields } from "./ProvenanceFields";
import { FormError, LoginNeeded, Notice, inputCls } from "./ui";
import { VARIANT_PROBLEM_KEY } from "./variantProblemKey";

export const GRINDS: GrindOption[] = ["WHOLE_BEAN", "COARSE", "MEDIUM", "FINE", "ESPRESSO"];

type Options = Awaited<ReturnType<typeof loadOptions>>;
const loadOptions = () => query(FILTER_OPTIONS);

const emptyRow = (): VariantDraft => ({ grind: "WHOLE_BEAN", weightG: "200", priceTwd: "", stock: "0" });

export function NewCoffeeForm({ locale }: { locale: Locale }) {
  const { status, user, request } = useAuth();
  const router = useRouter();
  const [opts, setOpts] = useState<Options | null>(null);
  const [optsFailed, setOptsFailed] = useState(false);
  const [rows, setRows] = useState<VariantDraft[]>([emptyRow()]);
  const [error, setError] = useState<{ key: MessageKey; vars?: Record<string, number> } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadOptions().then(setOpts, () => setOptsFailed(true));
  }, []);

  if (status === "loading") return <Notice>{t(locale, "dash.loading")}</Notice>;
  if (status === "anonymous") return <LoginNeeded locale={locale} next="/dashboard/coffees/new" />;
  if (!user?.shop) {
    return (
      <Notice>
        <Link href="/dashboard" className="font-semibold text-ink underline-offset-4 hover:underline">
          {t(locale, "dash.openTitle")}
        </Link>
      </Notice>
    );
  }
  if (optsFailed) return <Notice>{t(locale, "error.title")}</Notice>;
  if (!opts) return <Notice>{t(locale, "dash.loading")}</Notice>;

  const problems = variantProblems(rows);
  const setRow = (i: number, patch: Partial<VariantDraft>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    const description = String(fd.get("description") ?? "").trim();
    const originCountryId = String(fd.get("origin") ?? "");
    const processingMethodId = String(fd.get("process") ?? "");
    const varietyId = String(fd.get("variety") ?? "") || null;
    const roastLevel = String(fd.get("roast") ?? "") as RoastLevel;
    const notes = parseFlavorNotes(String(fd.get("notes") ?? ""));
    const producer = String(fd.get("producer") ?? "").trim();
    const region = String(fd.get("region") ?? "").trim();
    const altitudeMin = String(fd.get("altitudeMin") ?? "");
    const altitudeMax = String(fd.get("altitudeMax") ?? "");
    const harvestYear = String(fd.get("harvestYear") ?? "");
    const brew = String(fd.get("brew") ?? "");
    const brewMethod = (BREW_METHODS as string[]).includes(brew) ? (brew as BrewMethod) : null;

    const detailsProblem = coffeeDetailsProblem(
      {
        name, description, originCountryId, processingMethodId, varietyId, roastLevel, flavorNotes: notes,
        producer, region, altitudeMin, altitudeMax, brewMethod, harvestYear,
      },
      ROAST_LEVELS,
    );
    if (detailsProblem) {
      return setError({ key: detailsErrorKey(detailsProblem), vars: { max: LIMITS.flavorNotes, len: LIMITS.flavorNote } });
    }
    const altitude = parseAltitude(altitudeMin, altitudeMax);
    if (altitude === "invalid") return setError({ key: "cf.error.altitude" });
    if (rows.length === 0) return setError({ key: "cf.error.noVariants" });
    const firstProblem = problems.values().next();
    if (!firstProblem.done) return setError({ key: VARIANT_PROBLEM_KEY[firstProblem.value] });

    setBusy(true);
    setError(null);
    try {
      await request(CREATE_COFFEE, {
        input: {
          name,
          description,
          originCountryId,
          processingMethodId,
          varietyId,
          roastLevel,
          flavorNotes: notes,
          producer,
          region,
          altitudeMinM: altitude.minM,
          altitudeMaxM: altitude.maxM,
          brewMethod,
          // coffeeDetailsProblem already refused an invalid year.
          harvestYear: parseHarvestYear(harvestYear) as number | null,
          variants: rows.map((r) => ({
            grind: r.grind as GrindOption,
            weightG: parseWhole(r.weightG, 1, LIMITS.weightG)!,
            priceTwd: parseWhole(r.priceTwd, 0, LIMITS.priceTwd)!,
            stock: parseWhole(r.stock, 0, LIMITS.stock)!,
          })),
        },
      });
      router.push("/dashboard");
    } catch (err) {
      const e2 = toApiError(err);
      const key =
        e2.code === "BAD_USER_INPUT" && ["flavorNotes", "altitudeMinM", "altitudeMaxM", "producer", "region", "harvestYear"].includes(e2.field ?? "")
          ? detailsErrorKey(apiDetailsProblem(e2.field))
          : "cf.error.generic";
      setError({ key, vars: { max: LIMITS.flavorNotes, len: LIMITS.flavorNote } });
      setBusy(false);
    }
  }

  const select = (name: string, label: MessageKey, items: { id: string; label: string }[], required = true) => (
    <label className="block text-sm font-medium text-neutral-700">
      {t(locale, label)}
      {required && " *"}
      <select name={name} required={required} defaultValue="" className={inputCls}>
        <option value="">{t(locale, "cf.choose")}</option>
        {items.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {error && <FormError>{t(locale, error.key, error.vars)}</FormError>}

      <section className="grid gap-4 rounded-2xl bg-white p-6 ring-1 ring-neutral-200 sm:grid-cols-2">
        <label className="block text-sm font-medium text-neutral-700 sm:col-span-2">
          {t(locale, "cf.name")} *
          <input name="name" required maxLength={LIMITS.coffeeName} placeholder={t(locale, "cf.namePlaceholder")} className={inputCls} />
        </label>
        {select(
          "origin",
          "cf.origin",
          opts.originCountries.map((o) => ({ id: o.id, label: pick(locale, o.nameZh, o.nameEn) })),
        )}
        {select(
          "process",
          "cf.process",
          opts.processingMethods.map((o) => ({ id: o.id, label: pick(locale, o.nameZh, o.nameEn) })),
        )}
        {select("variety", "cf.variety", opts.coffeeVarieties.map((o) => ({ id: o.id, label: o.name })), false)}
        {select("roast", "cf.roast", ROAST_LEVELS.map((r) => ({ id: r, label: t(locale, `roast.${r}`) })))}
        {select("brew", "cf.brew", brewOptions(locale), false)}
        <label className="block text-sm font-medium text-neutral-700 sm:col-span-2">
          {t(locale, "cf.flavorNotes")}
          <input name="notes" placeholder={t(locale, "filter.flavorPlaceholder")} className={inputCls} />
          <span className="mt-1 block text-xs font-normal text-neutral-500">
            {t(locale, "cf.flavorHint", { max: LIMITS.flavorNotes })}
          </span>
        </label>
        <ProvenanceFields locale={locale} />
        <label className="block text-sm font-medium text-neutral-700 sm:col-span-2">
          {t(locale, "cf.description")}
          <textarea name="description" rows={5} maxLength={LIMITS.coffeeDescription} className={inputCls} />
        </label>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-neutral-200">
        <h2 className="text-lg font-bold text-ink">{t(locale, "cf.variants")} *</h2>
        <p className="mt-1 text-sm text-neutral-500">{t(locale, "cf.variantsHint")}</p>
        <ul className="mt-4 space-y-3">
          {rows.map((r, i) => {
            const problem = problems.get(i);
            return (
              <li key={i} className="rounded-xl bg-neutral-50 p-3 ring-1 ring-neutral-200">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto] sm:items-end">
                  <label className="block text-xs font-medium text-neutral-600">
                    {t(locale, "cf.grind")}
                    <select value={r.grind} onChange={(e) => setRow(i, { grind: e.target.value })} className={inputCls}>
                      {GRINDS.map((g) => (
                        <option key={g} value={g}>
                          {t(locale, `grind.${g}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    {t(locale, "cf.weightG")}
                    <input inputMode="numeric" value={r.weightG} onChange={(e) => setRow(i, { weightG: e.target.value })} className={inputCls} />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    {t(locale, "cf.priceTwd")}
                    <input inputMode="numeric" value={r.priceTwd} onChange={(e) => setRow(i, { priceTwd: e.target.value })} className={inputCls} />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    {t(locale, "cf.stock")}
                    <input inputMode="numeric" value={r.stock} onChange={(e) => setRow(i, { stock: e.target.value })} className={inputCls} />
                  </label>
                  <button
                    type="button"
                    disabled={rows.length === 1}
                    onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                    className="col-span-2 justify-self-end rounded-full px-3 py-2 text-sm text-neutral-500 hover:text-red-700 disabled:opacity-40 sm:col-span-1"
                  >
                    {t(locale, "cf.removeRow")}
                  </button>
                </div>
                {problem && r.priceTwd !== "" && (
                  <p className="mt-2 text-xs text-red-600">{t(locale, VARIANT_PROBLEM_KEY[problem])}</p>
                )}
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          disabled={rows.length >= LIMITS.variants}
          onClick={() => setRows((rs) => [...rs, { ...emptyRow(), weightG: "" }])}
          className="mt-3 rounded-full border border-neutral-300 px-4 py-2 text-sm hover:border-neutral-500 disabled:opacity-40"
        >
          {t(locale, "cf.addRow")}
        </button>
      </section>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-ink px-6 py-2.5 font-semibold text-white hover:bg-neutral-700 disabled:opacity-60"
        >
          {busy ? t(locale, "cf.saving") : t(locale, "cf.save")}
        </button>
        <Link href="/dashboard" className="text-sm text-neutral-600 hover:text-ink hover:underline underline-offset-4">
          {t(locale, "cf.back")}
        </Link>
      </div>
    </form>
  );
}
