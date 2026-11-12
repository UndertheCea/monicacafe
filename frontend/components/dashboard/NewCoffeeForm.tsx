"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BREW_METHODS, FILTER_OPTIONS, ROAST_LEVELS, type BrewMethod, type GrindOption, type RoastLevel } from "@/lib/api";
import { CREATE_COFFEE } from "@/lib/dashboard/queries";
import {
  LIMITS,
  coffeeDetailsProblem,
  filledOptionalCount,
  parseAltitude,
  parseHarvestYear,
  parseFlavorNotes,
  parseWhole,
  variantProblems,
  type OptionalDetails,
  type VariantDraft,
} from "@/lib/dashboard/validate";
import { query, toApiError } from "@/lib/graphql";
import { MAX_COFFEES_PER_SHOP } from "@/lib/dashboard/duplicateCoffee";
import { draftKey, isEmptyDraft, makeDraft, parseDraft } from "@/lib/dashboard/session";
import { pick, t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { brewOptions, coffeeBadInput, detailsMessage } from "./CoffeeDetailsForm";
import { COFFEE_ORDER, OPTIONAL_ORDER, isOptionalField, problemField, variantField } from "@/lib/dashboard/coffeeFields";
import type { CoffeeFieldKey } from "./coffeeFormErrors";
import { FormSummary, fieldMessage } from "@/components/FormSummary";
import type { FormErrors } from "@/lib/formErrors";
import { FlavorNotesField } from "./FlavorNotesField";
import { MoreDetails } from "./MoreDetails";
import { SignInAgain } from "./SignInAgain";
import { useSellerSession, useUnsavedChanges } from "./useSellerSession";
import { HarvestYearField, ProvenanceFields } from "./ProvenanceFields";
import { LoginNeeded, Notice } from "./ui";
import { VARIANT_PROBLEM_KEY } from "./variantProblemKey";
import { Button, Card, Field, Input, SectionTitle, Select, Textarea, useFormErrors } from "@/components/ui";

export const GRINDS: GrindOption[] = ["WHOLE_BEAN", "COARSE", "MEDIUM", "FINE", "ESPRESSO"];

type Options = Awaited<ReturnType<typeof loadOptions>>;
const loadOptions = () => query(FILTER_OPTIONS);

/** The folded optional fields as the new-coffee form holds them (named inputs). */
function optionalFromForm(fd: FormData): OptionalDetails {
  const get = (k: string) => String(fd.get(k) ?? "");
  return {
    description: get("description"),
    brewMethod: get("brew") || null,
    harvestYear: get("harvestYear"),
  };
}

const emptyRow = (): VariantDraft => ({ grind: "WHOLE_BEAN", weightG: "200", priceTwd: "", stock: "0" });

// sessionStorage can be missing or throw (private mode, storage full); a draft is a convenience, never required.
function readDraft(key: string) {
  try {
    return parseDraft(window.sessionStorage.getItem(key));
  } catch {
    return null;
  }
}
function writeDraft(key: string, value: string | null) {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // ignore: the form still works without a draft
  }
}

export function NewCoffeeForm({ locale }: { locale: Locale }) {
  const { view, user, request } = useSellerSession();
  const router = useRouter();
  const [opts, setOpts] = useState<Options | null>(null);
  const [optsFailed, setOptsFailed] = useState(false);
  const [rows, setRows] = useState<VariantDraft[]>([emptyRow()]);
  const [busy, setBusy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [filled, setFilled] = useState(0);
  // Autosaved draft (#228): fields typed so far, whether a draft was restored.
  const formRef = useRef<HTMLFormElement | null>(null);
  const [fieldsDirty, setFieldsDirty] = useState(false);
  const [restored, setRestored] = useState(false);
  const key = user ? draftKey(user.id) : null;
  // Focus order: the essentials, then each option row's weight / price / stock, then "More details".
  const order = useMemo<readonly CoffeeFieldKey[]>(
    () => [
      ...COFFEE_ORDER,
      ...rows.flatMap((_, i) => (["weight", "price", "stock"] as const).map((c) => variantField(i, c))),
      ...OPTIONAL_ORDER,
    ],
    [rows],
  );
  const fe = useFormErrors<CoffeeFieldKey>("new-coffee", order);

  useEffect(() => {
    loadOptions().then(setOpts, () => setOptsFailed(true));
  }, []);

  // Saves the form (text fields + option rows, never images) to sessionStorage.
  const persist = useCallback(
    (form: HTMLFormElement, currentRows: VariantDraft[]) => {
      if (!key) return false;
      const d = makeDraft(new FormData(form).entries(), currentRows);
      const empty = isEmptyDraft(d);
      writeDraft(key, empty ? null : JSON.stringify(d));
      return !empty;
    },
    [key],
  );
  // Disabled inputs drop out of FormData, so never save while the form is locked.
  const canSave = view === "open";
  useEffect(() => {
    if (formRef.current && canSave) persist(formRef.current, rows);
  }, [rows, persist, canSave]);

  // When the form first mounts, put a saved draft back: named inputs are
  // uncontrolled, so their values are set on the DOM; option rows are state.
  const mountForm = useCallback(
    (form: HTMLFormElement | null) => {
      formRef.current = form;
      if (!form || !key || form.dataset.restored) return;
      form.dataset.restored = "1";
      const d = readDraft(key);
      if (!d) return;
      for (const [name, value] of Object.entries(d.fields)) {
        const el = form.elements.namedItem(name);
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
          el.value = value;
        }
      }
      if (d.rows.length > 0) setRows(d.rows);
      setFilled(filledOptionalCount(optionalFromForm(new FormData(form))));
      setFieldsDirty(true);
      setRestored(true);
    },
    [key],
  );

  function discardDraft() {
    if (key) writeDraft(key, null);
    formRef.current?.reset();
    setRows([emptyRow()]);
    setFilled(0);
    setFieldsDirty(false);
    setRestored(false);
  }

  const dirty = fieldsDirty || !isEmptyDraft({ fields: {}, rows });
  useUnsavedChanges(dirty && !busy, t(locale, "dash.unsavedConfirm"));

  if (view === "loading") return <Notice>{t(locale, "dash.loading")}</Notice>;
  if (view === "login") return <LoginNeeded locale={locale} next="/dashboard/coffees/new" />;
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
    const roast = String(fd.get("roast") ?? "");
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
        name, description, originCountryId, processingMethodId, varietyId, roastLevel: roast, flavorNotes: notes,
        producer, region, altitudeMin, altitudeMax, brewMethod, harvestYear,
      },
      ROAST_LEVELS,
    );
    if (detailsProblem) {
      const field = problemField(detailsProblem, { name, originCountryId, processingMethodId, altitudeMin });
      if (isOptionalField(field)) setMoreOpen(true);
      return fe.failField(field, detailsMessage(detailsProblem));
    }
    const altitude = parseAltitude(altitudeMin, altitudeMax);
    if (altitude === "invalid" || altitude.minM === null) {
      return fe.failField(problemField("altitude", { name, originCountryId, processingMethodId, altitudeMin }), {
        key: "cf.error.altitude",
      });
    }
    if (rows.length === 0) return fe.fail({ fields: {}, form: { key: "cf.error.noVariants" } });
    if (problems.size > 0) {
      // Every row with a problem, each under the control that is wrong (a duplicate points at the weight).
      const fields: FormErrors<CoffeeFieldKey>["fields"] = {};
      for (const [i, p] of problems) {
        fields[variantField(i, p === "price" || p === "stock" ? p : "weight")] = { key: VARIANT_PROBLEM_KEY[p] };
      }
      return fe.fail({ fields });
    }

    setBusy(true);
    fe.clear();
    try {
      await request(CREATE_COFFEE, {
        input: {
          name,
          description,
          originCountryId,
          processingMethodId,
          varietyId,
          // coffeeDetailsProblem already refused anything but "" or a known level.
          roastLevel: roast ? (roast as RoastLevel) : null,
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
      if (key) writeDraft(key, null);
      setFieldsDirty(false);
      router.push("/dashboard");
    } catch (err) {
      const e2 = toApiError(err);
      if (e2.code === "LIMIT_REACHED") {
        fe.fail({ fields: {}, form: { key: "dash.error.coffeeLimit", vars: { max: MAX_COFFEES_PER_SHOP } } });
      } else {
        const failed: FormErrors<CoffeeFieldKey> =
          e2.code === "BAD_USER_INPUT"
            ? coffeeBadInput(e2.field, notes.length, order)
            : { fields: {}, form: { key: "cf.error.generic" } };
        const placed = Object.keys(failed.fields)[0];
        if (placed && isOptionalField(placed)) setMoreOpen(true);
        fe.fail(failed);
      }
      setBusy(false);
    }
  }

  const select = (name: CoffeeFieldKey, label: MessageKey, items: { id: string; label: string }[], required = true) => (
    <Field
      id={fe.id(name)}
      label={`${t(locale, label)}${required ? " *" : ""}`}
      error={fieldMessage(locale, fe.errors, name)}
    >
      {(p) => (
        <Select {...p} name={name} required={required} defaultValue="">
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

  const locked = view === "locked";
  return (
    <div className="space-y-6">
      {locked && <SignInAgain locale={locale} email={user.email} />}
      <form
        ref={mountForm}
        onSubmit={onSubmit}
        onChange={(e) => {
          setFilled(filledOptionalCount(optionalFromForm(new FormData(e.currentTarget))));
          setFieldsDirty(persist(e.currentTarget, rows));
          // The named inputs share the details fields' names: editing one clears its error.
          const name = (e.target as unknown as { name?: string }).name;
          if (name) fe.clearField(name as CoffeeFieldKey);
        }}
        noValidate
      >
        <fieldset disabled={locked} className="m-0 min-w-0 space-y-6 border-0 p-0">
          {restored && (
            <p role="status" className="flex flex-wrap items-center gap-3 rounded-box bg-paper px-3 py-2 text-sm text-ink ring-1 ring-line">
              {t(locale, "dash.draftRestored")}
              <button type="button" onClick={discardDraft} className="font-semibold underline underline-offset-4">
                {t(locale, "dash.draftDiscard")}
              </button>
            </p>
          )}
          <FormSummary formId="new-coffee" locale={locale} errors={fe.errors} order={order} />

          <Card as="section" className="grid gap-4 p-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <SectionTitle>{t(locale, "cf.essentials")}</SectionTitle>
              <p className="mt-1 text-sm text-muted">{t(locale, "cf.essentialsHint")}</p>
            </div>
            <Field
              id={fe.id("name")}
              label={`${t(locale, "cf.name")} *`}
              error={fieldMessage(locale, fe.errors, "name")}
              className="sm:col-span-2"
            >
              {(p) => (
                <Input {...p} name="name" required maxLength={LIMITS.coffeeName} placeholder={t(locale, "cf.namePlaceholder")} />
              )}
            </Field>
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
            {select("variety", "cf.variety", opts.coffeeVarieties.map((o) => ({ id: o.id, label: o.name })))}
            {select("roast", "cf.roast", ROAST_LEVELS.map((r) => ({ id: r, label: t(locale, `roast.${r}`) })), false)}
            <p className="-mt-2 text-xs text-muted sm:col-span-2">{t(locale, "cf.varietyHint")}</p>
            <ProvenanceFields locale={locale} fe={fe} />
            <FlavorNotesField locale={locale} fe={fe} />
          </Card>

          <Card as="section" className="p-6">
            <SectionTitle>{t(locale, "cf.variants")} *</SectionTitle>
            <p className="mt-1 text-sm text-muted">{t(locale, "cf.variantsHint")}</p>
            <ul className="mt-4 space-y-3">
              {rows.map((r, i) => {
                const problem = problems.get(i);
                // The control the submitted problem is under (its message below carries the id the control names).
                const bad = (["weight", "price", "stock"] as const).find((c) => fe.errors.fields[variantField(i, c)]);
                const ctl = (c: "weight" | "price" | "stock") => fe.control(variantField(i, c));
                const clear = (c: "weight" | "price" | "stock") => fe.clearField(variantField(i, c));
                return (
                  <li key={i} className="rounded-box bg-paper p-3 ring-1 ring-line">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto] sm:items-end">
                      <label className="block text-xs font-medium text-muted">
                        {t(locale, "cf.grind")}
                        <Select value={r.grind} onChange={(e) => setRow(i, { grind: e.target.value })} className="mt-1">
                          {GRINDS.map((g) => (
                            <option key={g} value={g}>
                              {t(locale, `grind.${g}`)}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <label className="block text-xs font-medium text-muted">
                        {t(locale, "cf.weightG")}
                        <Input
                          {...ctl("weight")}
                          inputMode="numeric"
                          value={r.weightG}
                          onChange={(e) => {
                            setRow(i, { weightG: e.target.value });
                            clear("weight");
                          }}
                          className="mt-1"
                        />
                      </label>
                      <label className="block text-xs font-medium text-muted">
                        {t(locale, "cf.priceTwd")}
                        <Input
                          {...ctl("price")}
                          inputMode="numeric"
                          value={r.priceTwd}
                          onChange={(e) => {
                            setRow(i, { priceTwd: e.target.value });
                            clear("price");
                          }}
                          className="mt-1"
                        />
                      </label>
                      <label className="block text-xs font-medium text-muted">
                        {t(locale, "cf.stock")}
                        <Input
                          {...ctl("stock")}
                          inputMode="numeric"
                          value={r.stock}
                          onChange={(e) => {
                            setRow(i, { stock: e.target.value });
                            clear("stock");
                          }}
                          className="mt-1"
                        />
                      </label>
                      <Button
                        type="button"
                        disabled={rows.length === 1}
                        onClick={() => {
                          setRows((rs) => rs.filter((_, j) => j !== i));
                          fe.clear(); // errors are keyed by row number, which just shifted
                        }}
                        variant="quiet" size="sm" className="col-span-2 justify-self-end sm:col-span-1"
                      >
                        {t(locale, "cf.removeRow")}
                      </Button>
                    </div>
                    {bad ? (
                      <p id={`${fe.id(variantField(i, bad))}-error`} className="mt-2 text-xs text-danger">
                        {fieldMessage(locale, fe.errors, variantField(i, bad))}
                      </p>
                    ) : (
                      problem &&
                      r.priceTwd !== "" && <p className="mt-2 text-xs text-danger">{t(locale, VARIANT_PROBLEM_KEY[problem])}</p>
                    )}
                  </li>
                );
              })}
            </ul>
            <Button
              type="button"
              disabled={rows.length >= LIMITS.variants}
              onClick={() => setRows((rs) => [...rs, { ...emptyRow(), weightG: "" }])}
              variant="secondary" className="mt-3"
            >
              {t(locale, "cf.addRow")}
            </Button>
          </Card>

          <MoreDetails locale={locale} filled={filled} open={moreOpen} onOpenChange={setMoreOpen}>
            <Field
              id={fe.id("description")}
              label={t(locale, "cf.description")}
              error={fieldMessage(locale, fe.errors, "description")}
              className="sm:col-span-2"
            >
              {(p) => <Textarea {...p} name="description" rows={5} maxLength={LIMITS.coffeeDescription} />}
            </Field>
            {select("brew", "cf.brew", brewOptions(locale), false)}
            <HarvestYearField locale={locale} fe={fe} />
          </MoreDetails>

          <div className="flex items-center gap-4">
            <Button
              type="submit"
              disabled={busy}
            >
              {busy ? t(locale, "cf.saving") : t(locale, "cf.save")}
            </Button>
            <Button href="/dashboard" variant="quiet" size="sm">
              {t(locale, "cf.back")}
            </Button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
