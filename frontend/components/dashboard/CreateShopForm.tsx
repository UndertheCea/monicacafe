"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { CREATE_SHOP } from "@/lib/dashboard/queries";
import { LIMITS, normaliseShopSlug, runes, suggestSlug } from "@/lib/dashboard/validate";
import { toApiError } from "@/lib/graphql";
import { t, type Locale } from "@/lib/i18n/dict";
import { Button, Card, Field, Input, SectionTitle, Textarea, useFormErrors } from "@/components/ui";
import { FormSummary, fieldMessage } from "@/components/FormSummary";
import { placeError } from "@/lib/formErrors";
import { isContactInfoError } from "@/lib/moderation";

type ShopField = "name" | "city" | "slug" | "description";
const ORDER: readonly ShopField[] = ["name", "city", "slug", "description"];

export function CreateShopForm({ locale, onCreated }: { locale: Locale; onCreated: () => void }) {
  const { request, reload } = useAuth();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const fe = useFormErrors<ShopField>("create-shop", ORDER);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const city = String(fd.get("city") ?? "").trim();
    const description = String(fd.get("description") ?? "").trim();
    const cleanSlug = normaliseShopSlug(slug);
    if (!name.trim()) return fe.failField("name", { key: "dash.error.required" });
    if (!city) return fe.failField("city", { key: "dash.error.required" });
    if (!cleanSlug) return fe.failField("slug", { key: "dash.error.slug" });
    setBusy(true);
    fe.clear();
    try {
      await request(CREATE_SHOP, { input: { slug: cleanSlug, name: name.trim(), city, description } });
      await reload(); // new token (role SELLER) + user.shop for the header menu
      onCreated();
    } catch (err) {
      const e2 = toApiError(err);
      // CONFLICT: the slug is taken (or you already have a shop: no field, so the summary says "couldn't save").
      fe.fail(
        isContactInfoError(e2.code)
          ? placeError(e2.field ?? "description", { key: "contact.error" }, ORDER)
          : e2.code === "CONFLICT" && e2.field === "slug"
          ? placeError("slug", { key: "dash.error.slugTaken" }, ORDER)
          : e2.code === "BAD_USER_INPUT" && ["slug", "name", "city"].includes(e2.field ?? "")
            ? placeError(e2.field, { key: e2.field === "slug" ? "dash.error.slug" : "dash.error.required" }, ORDER)
            : { fields: {}, form: { key: e2.code === "CONFLICT" ? "dash.error.slugTaken" : "dash.error.generic" } },
      );
      setBusy(false);
    }
  }

  return (
    <Card as="section" className="p-6">
      <SectionTitle>{t(locale, "dash.openTitle")}</SectionTitle>
      <p className="mt-1 text-sm text-muted">{t(locale, "dash.openSub")}</p>
      <form onSubmit={onSubmit} noValidate className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2 empty:hidden">
          <FormSummary formId="create-shop" locale={locale} errors={fe.errors} order={ORDER} />
        </div>
        <Field id={fe.id("name")} label={`${t(locale, "dash.shopName")} *`} error={fieldMessage(locale, fe.errors, "name")}>
          {(p) => (
            <Input
              {...p}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                fe.clearField("name");
                if (!slugTouched) setSlug(suggestSlug(e.target.value));
              }}
              required
              maxLength={LIMITS.shopName}
            />
          )}
        </Field>
        <Field id={fe.id("city")} label={`${t(locale, "dash.city")} *`} error={fieldMessage(locale, fe.errors, "city")}>
          {(p) => (
            <Input
              {...p}
              name="city"
              onChange={() => fe.clearField("city")}
              required
              maxLength={LIMITS.city}
              placeholder={t(locale, "dash.cityPlaceholder")}
            />
          )}
        </Field>
        <Field
          id={fe.id("slug")}
          label={`${t(locale, "dash.shopSlug")} *`}
          hint={t(locale, "dash.shopSlugHint", { slug: normaliseShopSlug(slug) ?? "…" })}
          error={fieldMessage(locale, fe.errors, "slug")}
          className="sm:col-span-2"
        >
          {(p) => (
            <Input
              {...p}
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
                fe.clearField("slug");
              }}
              required
              maxLength={48}
              autoCapitalize="none"
              spellCheck={false}
              className="font-mono"
            />
          )}
        </Field>
        <Field
          id={fe.id("description")}
          label={t(locale, "dash.description")}
          hint={t(locale, "contact.hint")}
          error={fieldMessage(locale, fe.errors, "description")}
          className="sm:col-span-2"
        >
          {(p) => (
            <Textarea
              {...p}
              name="description"
              rows={4}
              maxLength={LIMITS.shopDescription}
              onInput={(e) => {
                const el = e.currentTarget;
                if (runes(el.value) > LIMITS.shopDescription) el.value = [...el.value].slice(0, LIMITS.shopDescription).join("");
              }}
            />
          )}
        </Field>
        <div className="sm:col-span-2">
          <Button
            type="submit"
            disabled={busy}
          >
            {busy ? t(locale, "auth.submitting") : t(locale, "dash.createShop")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
