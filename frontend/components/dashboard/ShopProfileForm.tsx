"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { MY_SHOP_PROFILE, UPDATE_SHOP, type EditableShop } from "@/lib/dashboard/queries";
import {
  LIMITS,
  inTaiwan,
  parseCoords,
  shopProfilePatch,
  shopProfileProblem,
  type ShopProfile,
  type ShopProfileProblem,
} from "@/lib/dashboard/validate";
import { toApiError } from "@/lib/graphql";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { ShopImages } from "./ShopImages";
import { SignInAgain } from "./SignInAgain";
import { useSellerSession, useUnsavedChanges } from "./useSellerSession";
import { FormError, LoginNeeded, Notice, inputCls } from "./ui";

// Leaflet touches `window`; load the picker on the client only.
const LocationPicker = dynamic(() => import("./LocationPicker").then((m) => m.LocationPicker), { ssr: false });

type Load = { state: "loading" } | { state: "error" } | { state: "ready"; shop: EditableShop | null };

const PROBLEM_KEY: Record<ShopProfileProblem, MessageKey> = {
  required: "dash.error.required",
  name: "shop.error.name",
  description: "shop.error.description",
  city: "shop.error.city",
  coords: "shop.error.coords",
};

const profileOf = (s: EditableShop): ShopProfile => ({
  name: s.name,
  description: s.description,
  city: s.city,
  lat: s.lat,
  lng: s.lng,
});

export function ShopProfileForm({ locale }: { locale: Locale }) {
  const { status, view, user, request } = useSellerSession();
  const [load, setLoad] = useState<Load>({ state: "loading" });

  const loadShop = useCallback(async (): Promise<Load> => {
    try {
      const r = await request(MY_SHOP_PROFILE);
      return { state: "ready", shop: r.me?.shop ?? null };
    } catch {
      return { state: "error" };
    }
  }, [request]);

  // Fetch on sign-in; setState happens in the promise callback, and a stale
  // response (status changed meanwhile) is dropped.
  useEffect(() => {
    if (status !== "authenticated") return;
    let live = true;
    void loadShop().then((l) => live && setLoad(l));
    return () => {
      live = false;
    };
  }, [status, loadShop]);

  if (view === "loading") return <Notice>{t(locale, "dash.loading")}</Notice>;
  if (view === "login") return <LoginNeeded locale={locale} next="/dashboard/shop" />;
  if (load.state === "loading") return <Notice>{t(locale, "dash.loading")}</Notice>;
  if (load.state === "error") return <Notice>{t(locale, "error.title")}</Notice>;
  if (!load.shop) {
    return (
      <Notice>
        <Link href="/dashboard" className="font-semibold text-ink underline-offset-4 hover:underline">
          {t(locale, "dash.openTitle")}
        </Link>
      </Notice>
    );
  }
  const onSaved = (shop: EditableShop) => setLoad({ state: "ready", shop });
  // Session ended with the page open (#228): keep the editor (and what was
  // typed) mounted but disabled under an inline sign-in.
  const locked = view === "locked";
  return (
    <div className="space-y-6">
      {locked && <SignInAgain locale={locale} email={user?.email} />}
      <fieldset disabled={locked} className="m-0 min-w-0 space-y-6 border-0 p-0">
        <ShopImages shop={load.shop} locale={locale} onSaved={onSaved} />
        <ProfileEditor key={load.shop.id} shop={load.shop} locale={locale} onSaved={onSaved} />
      </fieldset>
    </div>
  );
}

function ProfileEditor({
  shop,
  locale,
  onSaved,
}: {
  shop: EditableShop;
  locale: Locale;
  onSaved: (s: EditableShop) => void;
}) {
  const { request } = useAuth();
  const [name, setName] = useState(shop.name);
  const [description, setDescription] = useState(shop.description);
  const [city, setCity] = useState(shop.city);
  const [lat, setLat] = useState(shop.lat === null ? "" : String(shop.lat));
  const [lng, setLng] = useState(shop.lng === null ? "" : String(shop.lng));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; key: MessageKey } | null>(null);

  const coords = useMemo(() => parseCoords(lat, lng), [lat, lng]);
  const picked = typeof coords === "object" ? coords : null;
  const draft: ShopProfile = {
    name,
    description,
    city,
    lat: picked?.lat ?? null,
    lng: picked?.lng ?? null,
  };
  const patch = shopProfilePatch(profileOf(shop), draft);
  const dirty = Object.keys(patch).length > 0;
  useUnsavedChanges(dirty && !busy, t(locale, "dash.unsavedConfirm"));
  const outsideTaiwan = picked !== null && !inTaiwan(picked);
  const clear = () => setMsg(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (coords === "invalid") return setMsg({ ok: false, key: "shop.error.coords" });
    const problem = shopProfileProblem(draft);
    if (problem) return setMsg({ ok: false, key: PROBLEM_KEY[problem] });
    if (!dirty) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await request(UPDATE_SHOP, { id: shop.id, input: patch });
      onSaved(r.updateShop);
      setMsg({ ok: true, key: "cf.saved" });
    } catch (err) {
      const e2 = toApiError(err);
      setMsg({
        ok: false,
        key: e2.code === "BAD_USER_INPUT" && (e2.field === "lat" || e2.field === "lng") ? "shop.error.coords" : "dash.error.generic",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <section className="grid gap-4 rounded-2xl bg-white p-6 ring-1 ring-neutral-200 sm:grid-cols-2">
        <label className="block text-sm font-medium text-neutral-700">
          {t(locale, "dash.shopName")} *
          <input
            value={name}
            onChange={(e) => (setName(e.target.value), clear())}
            required
            maxLength={LIMITS.shopName}
            className={inputCls}
          />
        </label>
        <label className="block text-sm font-medium text-neutral-700">
          {t(locale, "dash.city")} *
          <input
            value={city}
            onChange={(e) => (setCity(e.target.value), clear())}
            required
            maxLength={LIMITS.city}
            placeholder={t(locale, "dash.cityPlaceholder")}
            className={inputCls}
          />
        </label>
        <label className="block text-sm font-medium text-neutral-700 sm:col-span-2">
          {t(locale, "dash.description")}
          <textarea
            value={description}
            onChange={(e) => (setDescription(e.target.value), clear())}
            rows={5}
            maxLength={LIMITS.shopDescription}
            className={inputCls}
          />
        </label>
        <p className="text-xs text-neutral-500 sm:col-span-2">
          {t(locale, "shop.slugFixed")} <span className="font-mono">/shops/{shop.slug}</span>
        </p>
      </section>

      <section className="space-y-4 rounded-2xl bg-white p-6 ring-1 ring-neutral-200">
        <div>
          <h2 className="text-lg font-bold text-ink">{t(locale, "shop.location")}</h2>
          <p className="mt-1 text-sm text-neutral-500">{t(locale, "shop.locationHint")}</p>
        </div>
        <LocationPicker
          value={picked}
          onPick={(c) => {
            setLat(String(c.lat));
            setLng(String(c.lng));
            clear();
          }}
          ariaLabel={t(locale, "shop.mapAria")}
          loadingLabel={t(locale, "map.loading")}
          failedLabel={t(locale, "map.loadFailed")}
        />
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm font-medium text-neutral-700">
            {t(locale, "shop.lat")}
            <input inputMode="decimal" value={lat} onChange={(e) => (setLat(e.target.value), clear())} className={inputCls} />
          </label>
          <label className="block text-sm font-medium text-neutral-700">
            {t(locale, "shop.lng")}
            <input inputMode="decimal" value={lng} onChange={(e) => (setLng(e.target.value), clear())} className={inputCls} />
          </label>
        </div>
        {coords === "invalid" && (lat.trim() !== "" && lng.trim() !== "") && (
          <p className="text-sm text-red-600">{t(locale, "shop.error.coords")}</p>
        )}
        {outsideTaiwan && (
          <p role="status" className="rounded-xl bg-white px-3 py-2 text-sm text-ink ring-1 ring-neutral-300">
            {t(locale, "shop.outsideTaiwan")}
          </p>
        )}
        {shop.lat !== null && coords === "empty" && (
          <p className="text-xs text-neutral-500">{t(locale, "shop.cantClear")}</p>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={busy || !dirty}
          className="rounded-full bg-ink px-6 py-2.5 font-semibold text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          {busy ? t(locale, "cf.saving") : t(locale, "cf.saveDetails")}
        </button>
        {msg &&
          (msg.ok ? (
            <p role="status" className="text-sm text-ink">
              {t(locale, msg.key)}
            </p>
          ) : (
            <FormError>{t(locale, msg.key)}</FormError>
          ))}
      </div>
    </form>
  );
}
