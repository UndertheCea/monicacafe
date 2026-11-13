"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { UPDATE_SHOP, type EditableShop } from "@/lib/dashboard/queries";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { ImageUploader } from "./ImageUploader";
import { Card, ConfirmButton, Picture, SectionTitle } from "@/components/ui";

/** Logo + banner for the shop profile page. Each change is saved immediately. */
export function ShopImages({
  shop,
  locale,
  onSaved,
}: {
  shop: EditableShop;
  locale: Locale;
  onSaved: (s: EditableShop) => void;
}) {
  const { request } = useAuth();
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(field: "logoUrl" | "bannerUrl", url: string) {
    const r = await request(UPDATE_SHOP, { id: shop.id, input: { [field]: url } });
    onSaved(r.updateShop);
  }

  async function remove(field: "logoUrl" | "bannerUrl") {
    setBusy(true);
    setError(null);
    try {
      await save(field, "");
    } catch {
      setError("img.error.save");
    } finally {
      setBusy(false);
    }
  }

  const slot = (field: "logoUrl" | "bannerUrl", kind: "SHOP_LOGO" | "SHOP_BANNER", title: MessageKey, alt: MessageKey) => {
    const url = shop[field];
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">{t(locale, title)}</h3>
        <div
          className={`overflow-hidden bg-paper ring-1 ring-line ${
            field === "logoUrl" ? "h-24 w-24 rounded-box" : "aspect-[3/1] w-full rounded-box"
          }`}
        >
          {url ? (
            <Picture
              src={url}
              thumb
              width={field === "logoUrl" ? 96 : 640}
              height={field === "logoUrl" ? 96 : 213}
              alt={t(locale, alt, { name: shop.name })}
            />
          ) : (
            <span className="grid h-full w-full place-items-center text-xs text-muted">{t(locale, "img.none")}</span>
          )}
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <ImageUploader
            kind={kind}
            targetId={shop.id}
            locale={locale}
            disabled={busy}
            label={t(locale, url ? "img.replace" : "img.upload")}
            onUploaded={(u) => save(field, u)}
          />
          {url && (
            <ConfirmButton
              question={t(locale, "img.removeConfirm")}
              confirmLabel={t(locale, "img.remove")}
              cancelLabel={t(locale, "confirm.cancel")}
              busy={busy}
              onConfirm={() => void remove(field)}
            >
              {t(locale, "img.remove")}
            </ConfirmButton>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card as="section" className="space-y-6 p-6">
      <SectionTitle>{t(locale, "img.shopTitle")}</SectionTitle>
      <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
        {slot("logoUrl", "SHOP_LOGO", "img.logo", "img.logoAlt")}
        {slot("bannerUrl", "SHOP_BANNER", "img.banner", "img.bannerAlt")}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {t(locale, error)}
        </p>
      )}
    </Card>
  );
}
