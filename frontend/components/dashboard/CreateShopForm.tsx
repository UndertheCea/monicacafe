"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { CREATE_SHOP } from "@/lib/dashboard/queries";
import { LIMITS, normaliseShopSlug, runes, suggestSlug } from "@/lib/dashboard/validate";
import { toApiError } from "@/lib/graphql";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { FormError } from "./ui";
import { Button, Card, Input, SectionTitle, Textarea } from "@/components/ui";
import { FIELD_LABEL } from "@/lib/ui";

export function CreateShopForm({ locale, onCreated }: { locale: Locale; onCreated: () => void }) {
  const { request, reload } = useAuth();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const city = String(fd.get("city") ?? "").trim();
    const description = String(fd.get("description") ?? "").trim();
    const cleanSlug = normaliseShopSlug(slug);
    if (!name.trim() || !city) return setError("dash.error.required");
    if (!cleanSlug) return setError("dash.error.slug");
    setBusy(true);
    setError(null);
    try {
      await request(CREATE_SHOP, { input: { slug: cleanSlug, name: name.trim(), city, description } });
      await reload(); // new token (role SELLER) + user.shop for the header menu
      onCreated();
    } catch (err) {
      const e2 = toApiError(err);
      setError(
        e2.code === "CONFLICT" ? "dash.error.slugTaken"
        : e2.code === "BAD_USER_INPUT" && e2.field === "slug" ? "dash.error.slug"
        : "dash.error.generic",
      );
      setBusy(false);
    }
  }

  return (
    <Card as="section" className="p-6">
      <SectionTitle>{t(locale, "dash.openTitle")}</SectionTitle>
      <p className="mt-1 text-sm text-muted">{t(locale, "dash.openSub")}</p>
      <form onSubmit={onSubmit} noValidate className="mt-5 grid gap-4 sm:grid-cols-2">
        {error && (
          <div className="sm:col-span-2">
            <FormError>{t(locale, error)}</FormError>
          </div>
        )}
        <label className={FIELD_LABEL}>
          {t(locale, "dash.shopName")} *
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(suggestSlug(e.target.value));
            }}
            required
            maxLength={LIMITS.shopName}
            className="mt-1"
          />
        </label>
        <label className={FIELD_LABEL}>
          {t(locale, "dash.city")} *
          <Input
            name="city"
            required
            maxLength={LIMITS.city}
            placeholder={t(locale, "dash.cityPlaceholder")}
            className="mt-1"
          />
        </label>
        <label className="block text-sm font-medium text-ink sm:col-span-2">
          {t(locale, "dash.shopSlug")} *
          <Input
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
            required
            maxLength={48}
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby="slug-hint"
            className="mt-1 font-mono"
          />
          <span id="slug-hint" className="mt-1 block text-xs font-normal text-muted">
            {t(locale, "dash.shopSlugHint", { slug: normaliseShopSlug(slug) ?? "…" })}
          </span>
        </label>
        <label className="block text-sm font-medium text-ink sm:col-span-2">
          {t(locale, "dash.description")}
          <Textarea
            name="description"
            rows={4}
            maxLength={LIMITS.shopDescription}
            onInput={(e) => {
              const el = e.currentTarget;
              if (runes(el.value) > LIMITS.shopDescription) el.value = [...el.value].slice(0, LIMITS.shopDescription).join("");
            }}
            className="mt-1"
          />
        </label>
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
