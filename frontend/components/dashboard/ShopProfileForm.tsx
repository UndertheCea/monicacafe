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
import { LoginNeeded, Notice } from "./ui";
import { Button, Card, Field, Input, SectionTitle, Textarea, useFormErrors } from "@/components/ui";
import { FormSummary, fieldMessage } from "@/components/FormSummary";
import { placeError } from "@/lib/formErrors";
import { FIELD_LABEL } from "@/lib/ui";

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

type ShopField = "name" | "city" | "description" | "lat" | "lng";
const ORDER: readonly ShopField[] = ["name", "city", "description", "lat", "lng"];
/** Where each client-side problem is shown. A half-filled pair can't happen (parseCoords calls it invalid). */
const PROBLEM_FIELD: Record<ShopProfileProblem, ShopField> = {
  required: "name",
  name: "name",
  description: "description",
  city: "city",
  coords: "lat",
};
/** The API's `field` for a refused updateShop → the message to show (the field itself is the form's own name). */
const API_KEY: Partial<Record<string, MessageKey>> = {
  name: "shop.error.name",
  city: "shop.error.city",
  description: "shop.error.description",
  lat: "shop.error.coords",
  lng: "shop.error.coords",
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
  const fe = useFormErrors<ShopField>("shop-profile", ORDER);
  const [saved, setSaved] = useState(false);

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
  const edited = (f: ShopField) => {
    setSaved(false);
    fe.clearField(f);
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    if (coords === "invalid") return fe.failField("lat", { key: "shop.error.coords" });
    const problem = shopProfileProblem(draft);
    if (problem) {
      // "required" is the name or the city, whichever is blank.
      const field = problem === "required" && name.trim() ? "city" : PROBLEM_FIELD[problem];
      return fe.failField(field, { key: PROBLEM_KEY[problem] });
    }
    if (!dirty) return;
    setBusy(true);
    fe.clear();
    try {
      const r = await request(UPDATE_SHOP, { id: shop.id, input: patch });
      onSaved(r.updateShop);
      setSaved(true);
    } catch (err) {
      const e2 = toApiError(err);
      const key = e2.code === "BAD_USER_INPUT" ? API_KEY[e2.field ?? ""] : undefined;
      fe.fail(
        key
          ? placeError(e2.field, { key }, ORDER)
          : { fields: {}, form: { key: "dash.error.generic" } },
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FormSummary formId="shop-profile" locale={locale} errors={fe.errors} order={ORDER} />
      <Card as="section" className="grid gap-4 p-6 sm:grid-cols-2">
        <Field id={fe.id("name")} label={`${t(locale, "dash.shopName")} *`} error={fieldMessage(locale, fe.errors, "name")}>
          {(p) => (
            <Input
              {...p}
              value={name}
              onChange={(e) => (setName(e.target.value), edited("name"))}
              required
              maxLength={LIMITS.shopName}
            />
          )}
        </Field>
        <Field id={fe.id("city")} label={`${t(locale, "dash.city")} *`} error={fieldMessage(locale, fe.errors, "city")}>
          {(p) => (
            <Input
              {...p}
              value={city}
              onChange={(e) => (setCity(e.target.value), edited("city"))}
              required
              maxLength={LIMITS.city}
              placeholder={t(locale, "dash.cityPlaceholder")}
            />
          )}
        </Field>
        <Field
          id={fe.id("description")}
          label={t(locale, "dash.description")}
          error={fieldMessage(locale, fe.errors, "description")}
          className="sm:col-span-2"
        >
          {(p) => (
            <Textarea
              {...p}
              value={description}
              onChange={(e) => (setDescription(e.target.value), edited("description"))}
              rows={5}
              maxLength={LIMITS.shopDescription}
            />
          )}
        </Field>
        <p className="text-xs text-muted sm:col-span-2">
          {t(locale, "shop.slugFixed")} <span className="font-mono">/shops/{shop.slug}</span>
        </p>
      </Card>

      <Card as="section" className="space-y-4 p-6">
        <div>
          <SectionTitle>{t(locale, "shop.location")}</SectionTitle>
          <p className="mt-1 text-sm text-muted">{t(locale, "shop.locationHint")}</p>
        </div>
        <LocationPicker
          value={picked}
          onPick={(c) => {
            setLat(String(c.lat));
            setLng(String(c.lng));
            setSaved(false);
            fe.clearField("lat");
            fe.clearField("lng");
          }}
          ariaLabel={t(locale, "shop.mapAria")}
          loadingLabel={t(locale, "map.loading")}
          failedLabel={t(locale, "map.loadFailed")}
        />
        <div className="grid grid-cols-2 gap-4">
          <label className={FIELD_LABEL}>
            {t(locale, "shop.lat")}
            <Input
              {...fe.control("lat")}
              inputMode="decimal"
              value={lat}
              onChange={(e) => (setLat(e.target.value), edited("lat"))}
              className="mt-1"
            />
          </label>
          <label className={FIELD_LABEL}>
            {t(locale, "shop.lng")}
            <Input
              {...fe.control("lng")}
              inputMode="decimal"
              value={lng}
              onChange={(e) => (setLng(e.target.value), edited("lng"))}
              className="mt-1"
            />
          </label>
        </div>
        {(fe.errors.fields.lat || fe.errors.fields.lng) ? (
          <p id={`${fe.id(fe.errors.fields.lat ? "lat" : "lng")}-error`} className="text-sm text-danger">
            {fieldMessage(locale, fe.errors, fe.errors.fields.lat ? "lat" : "lng")}
          </p>
        ) : (
          coords === "invalid" &&
          lat.trim() !== "" &&
          lng.trim() !== "" && <p className="text-sm text-danger">{t(locale, "shop.error.coords")}</p>
        )}
        {outsideTaiwan && (
          <Card as="p" role="status" className="px-3 py-2 text-sm text-ink">
            {t(locale, "shop.outsideTaiwan")}
          </Card>
        )}
        {shop.lat !== null && coords === "empty" && (
          <p className="text-xs text-muted">{t(locale, "shop.cantClear")}</p>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-4">
        <Button
          type="submit"
          disabled={busy || !dirty}
        >
          {busy ? t(locale, "cf.saving") : t(locale, "cf.saveDetails")}
        </Button>
        {saved && (
          <p role="status" className="text-sm text-ink">
            {t(locale, "cf.saved")}
          </p>
        )}
      </div>
    </form>
  );
}
