"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { isUUID, type GrindOption } from "@/lib/api";
import {
  ADD_VARIANT,
  DELETE_VARIANT,
  EDIT_COFFEE,
  UPDATE_VARIANT,
  type DashboardVariant,
  type EditableCoffee,
} from "@/lib/dashboard/queries";
import { canManageCoffee } from "@/lib/dashboard/preview";
import { LIMITS, parseWhole, variantProblems, type VariantDraft } from "@/lib/dashboard/validate";
import { toApiError } from "@/lib/graphql";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { CoffeeDetailsForm } from "./CoffeeDetailsForm";
import { CoffeeGallery } from "./CoffeeGallery";
import { DeleteCoffeeButton } from "./DeleteCoffeeButton";
import { GRINDS } from "./NewCoffeeForm";
import { SignInAgain } from "./SignInAgain";
import { useSellerSession, useUnsavedChanges } from "./useSellerSession";
import { FormError, LoginNeeded, Notice } from "./ui";
import { VARIANT_PROBLEM_KEY } from "./variantProblemKey";
import { Badge, Button, Card, Input, SectionTitle, Select } from "@/components/ui";
import { CARD } from "@/lib/ui";

type Load = { state: "loading" } | { state: "missing" } | { state: "error" } | { state: "ready"; coffee: EditableCoffee };

function errKey(code: string): MessageKey {
  if (code === "CONFLICT") return "cf.error.duplicate";
  return "cf.error.generic";
}

export function VariantManager({ coffeeId, locale }: { coffeeId: string; locale: Locale }) {
  const { status, view, user, request } = useSellerSession();
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ state: "loading" });

  const loadCoffee = useCallback(async (): Promise<Load> => {
    if (!isUUID(coffeeId)) return { state: "missing" };
    try {
      const r = await request(EDIT_COFFEE, { id: coffeeId });
      return r.coffee ? { state: "ready", coffee: r.coffee } : { state: "missing" };
    } catch {
      return { state: "error" };
    }
  }, [coffeeId, request]);
  const fetchCoffee = useCallback(() => loadCoffee().then(setLoad), [loadCoffee]);

  // Fetch on sign-in; setState happens in the promise callback, and a stale
  // response (status changed meanwhile) is dropped.
  useEffect(() => {
    if (status !== "authenticated") return;
    let live = true;
    void loadCoffee().then((l) => live && setLoad(l));
    return () => {
      live = false;
    };
  }, [status, loadCoffee]);

  if (view === "loading") return <Notice>{t(locale, "dash.loading")}</Notice>;
  if (view === "login") return <LoginNeeded locale={locale} next={`/dashboard/coffees/${coffeeId}`} />;
  if (load.state === "loading") return <Notice>{t(locale, "dash.loading")}</Notice>;
  if (load.state === "error") return <Notice>{t(locale, "error.title")}</Notice>;
  // Published coffees are visible to everyone, so also check ownership here
  // (the mutations re-check it server-side).
  if (load.state === "missing" || !canManageCoffee(load.coffee.shop.id, user)) {
    return <Notice>{t(locale, "cf.notYours")}</Notice>;
  }

  const coffee = load.coffee;
  const replace = (v: DashboardVariant) =>
    setLoad({ state: "ready", coffee: { ...coffee, variants: coffee.variants.map((x) => (x.id === v.id ? v : x)) } });

  return (
    <div className="space-y-6">
      {view === "locked" && <SignInAgain locale={locale} email={user?.email} />}
      {/* Session ended with the page open (#228): everything stays mounted, disabled, until signed in again. */}
      <fieldset disabled={view === "locked"} className="m-0 min-w-0 space-y-6 border-0 p-0">
        <div className="flex flex-wrap items-center gap-3">
          <SectionTitle>{coffee.name}</SectionTitle>
          <Badge tone="soft">{t(locale, coffee.isPublished ? "dash.published" : "dash.draft")}</Badge>
          {coffee.isPublished && (
            <Link href={`/coffees/${coffee.id}`} className="text-sm text-ink underline-offset-4 hover:underline">
              {t(locale, "dash.view")}
            </Link>
          )}
          <Link href={`/dashboard/coffees/${coffee.id}/preview`} className="text-sm text-ink underline-offset-4 hover:underline">
            {t(locale, "dash.preview")}
          </Link>
          {!coffee.isPublished && (
            <span className="ml-auto">
              <DeleteCoffeeButton coffeeId={coffee.id} locale={locale} onDeleted={() => router.push("/dashboard")} />
            </span>
          )}
        </div>

        <CoffeeDetailsForm
          coffee={coffee}
          locale={locale}
          onSaved={(c) => setLoad({ state: "ready", coffee: { ...coffee, ...c } })}
        />

        <CoffeeGallery
          coffee={coffee}
          locale={locale}
          onSaved={(c) => setLoad({ state: "ready", coffee: { ...coffee, ...c } })}
        />

        <Card as="section" className="p-4 sm:p-6">
          <h3 className="font-bold text-ink">{t(locale, "cf.variants")}</h3>
          <p className="mt-1 text-sm text-muted">{t(locale, "cf.variantsHint")}</p>
          {coffee.variants.length === 0 ? (
            <p className="mt-4 text-sm text-muted">{t(locale, "dash.noVariants")}</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {coffee.variants.map((v) => (
                <VariantRow
                  key={v.id}
                  variant={v}
                  locale={locale}
                  onSaved={replace}
                  onDeleted={() => void fetchCoffee()}
                  request={request}
                />
              ))}
            </ul>
          )}
        </Card>

        {coffee.variants.length < LIMITS.variants ? (
          <AddVariantForm
            coffeeId={coffee.id}
            existing={coffee.variants}
            locale={locale}
            request={request}
            onAdded={() => void fetchCoffee()}
          />
        ) : (
          // At the limit the add form goes away; say why instead of leaving a gap (#196).
          <Card as="p" role="note" className="p-4 text-sm text-muted sm:p-6">
            {t(locale, "cf.error.tooManyVariants", { max: LIMITS.variants })}
          </Card>
        )}
      </fieldset>
    </div>
  );
}

type Request = ReturnType<typeof useSellerSession>["request"];

function VariantRow({
  variant: v,
  locale,
  onSaved,
  onDeleted,
  request,
}: {
  variant: DashboardVariant;
  locale: Locale;
  onSaved: (v: DashboardVariant) => void;
  onDeleted: () => void;
  request: Request;
}) {
  const [price, setPrice] = useState(String(v.priceTwd));
  const [stock, setStock] = useState(String(v.stock));
  // isAvailable from the API is false when stock is 0; the seller's switch is
  // only meaningful with stock, so start it "on" for out-of-stock rows.
  const initialOnSale = v.isAvailable || v.stock === 0;
  const [onSale, setOnSale] = useState(initialOnSale);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; key: MessageKey } | null>(null);

  const p = parseWhole(price, 0, LIMITS.priceTwd);
  const s = parseWhole(stock, 0, LIMITS.stock);
  const dirty = p !== v.priceTwd || s !== v.stock || onSale !== initialOnSale;
  useUnsavedChanges(dirty && !busy, t(locale, "dash.unsavedConfirm"));

  async function save() {
    if (p === null) return setMsg({ ok: false, key: "cf.error.price" });
    if (s === null) return setMsg({ ok: false, key: "cf.error.stock" });
    setBusy(true);
    setMsg(null);
    try {
      // Send isAvailable only when toggled: for out-of-stock rows the API
      // can't tell us the stored flag, so don't overwrite it by accident.
      const input = { priceTwd: p, stock: s, ...(onSale !== initialOnSale ? { isAvailable: onSale } : {}) };
      const r = await request(UPDATE_VARIANT, { id: v.id, input });
      onSaved(r.updateVariant);
      setMsg({ ok: true, key: "cf.saved" });
    } catch (err) {
      setMsg({ ok: false, key: errKey(toApiError(err).code) });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(t(locale, "cf.deleteConfirm"))) return;
    setBusy(true);
    setMsg(null);
    try {
      await request(DELETE_VARIANT, { id: v.id });
      onDeleted();
    } catch (err) {
      const e = toApiError(err);
      setMsg({ ok: false, key: e.code === "BAD_USER_INPUT" ? "cf.error.lastVariant" : "cf.error.generic" });
      setBusy(false);
    }
  }

  return (
    <li className="rounded-box bg-paper p-3 ring-1 ring-line">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1.2fr_1fr_1fr_auto_auto] sm:items-end">
        <div className="col-span-2 text-sm font-semibold text-ink sm:col-span-1 sm:pb-2">
          {t(locale, `grind.${v.grind}`)} · {v.weightG} g
        </div>
        <label className="block text-xs font-medium text-muted">
          {t(locale, "cf.priceTwd")}
          <Input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1" />
        </label>
        <label className="block text-xs font-medium text-muted">
          {t(locale, "cf.stock")}
          <Input inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} className="mt-1" />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink sm:pb-2">
          <input type="checkbox" checked={onSale} onChange={(e) => setOnSale(e.target.checked)} className="h-4 w-4 accent-ink" />
          {t(locale, "cf.available")}
        </label>
        <div className="flex gap-2 justify-self-end">
          <Button
            type="button"
            disabled={busy || !dirty}
            onClick={() => void save()}
            size="sm"
          >
            {t(locale, "cf.saveRow")}
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            variant="quiet" size="sm"
          >
            {t(locale, "cf.deleteRow")}
          </Button>
        </div>
      </div>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-xs ${msg.ok ? "text-ink" : "text-danger"}`}>
          {t(locale, msg.key)}
        </p>
      )}
    </li>
  );
}

function AddVariantForm({
  coffeeId,
  existing,
  locale,
  request,
  onAdded,
}: {
  coffeeId: string;
  existing: DashboardVariant[];
  locale: Locale;
  request: Request;
  onAdded: () => void;
}) {
  const [row, setRow] = useState<VariantDraft>({ grind: "WHOLE_BEAN", weightG: "", priceTwd: "", stock: "0" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  useUnsavedChanges((row.weightG !== "" || row.priceTwd !== "" || row.stock !== "0") && !busy, t(locale, "dash.unsavedConfirm"));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    // Validate together with the existing rows so duplicates are caught locally.
    const all: VariantDraft[] = [
      ...existing.map((v) => ({ grind: v.grind, weightG: String(v.weightG), priceTwd: String(v.priceTwd), stock: String(v.stock) })),
      row,
    ];
    const problem = variantProblems(all).get(all.length - 1);
    if (problem) return setError(VARIANT_PROBLEM_KEY[problem]);
    setBusy(true);
    setError(null);
    try {
      await request(ADD_VARIANT, {
        coffeeId,
        input: {
          grind: row.grind as GrindOption,
          weightG: parseWhole(row.weightG, 1, LIMITS.weightG)!,
          priceTwd: parseWhole(row.priceTwd, 0, LIMITS.priceTwd)!,
          stock: parseWhole(row.stock, 0, LIMITS.stock)!,
        },
      });
      setRow({ grind: row.grind, weightG: "", priceTwd: "", stock: "0" });
      onAdded();
    } catch (err) {
      setError(errKey(toApiError(err).code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={add} noValidate className={`${CARD} p-4 sm:p-6`}>
      <h3 className="font-bold text-ink">{t(locale, "cf.addVariant")}</h3>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto] sm:items-end">
        <label className="block text-xs font-medium text-muted">
          {t(locale, "cf.grind")}
          <Select value={row.grind} onChange={(e) => setRow({ ...row, grind: e.target.value })} className="mt-1">
            {GRINDS.map((g) => (
              <option key={g} value={g}>
                {t(locale, `grind.${g}`)}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-xs font-medium text-muted">
          {t(locale, "cf.weightG")}
          <Input inputMode="numeric" value={row.weightG} onChange={(e) => setRow({ ...row, weightG: e.target.value })} className="mt-1" />
        </label>
        <label className="block text-xs font-medium text-muted">
          {t(locale, "cf.priceTwd")}
          <Input inputMode="numeric" value={row.priceTwd} onChange={(e) => setRow({ ...row, priceTwd: e.target.value })} className="mt-1" />
        </label>
        <label className="block text-xs font-medium text-muted">
          {t(locale, "cf.stock")}
          <Input inputMode="numeric" value={row.stock} onChange={(e) => setRow({ ...row, stock: e.target.value })} className="mt-1" />
        </label>
        <Button
          type="submit"
          disabled={busy}
          className="col-span-2 sm:col-span-1"
        >
          {t(locale, "cf.addVariant")}
        </Button>
      </div>
      {error && (
        <div className="mt-3">
          <FormError>{t(locale, error)}</FormError>
        </div>
      )}
    </form>
  );
}
