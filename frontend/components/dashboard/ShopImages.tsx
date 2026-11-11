"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { UPDATE_SHOP, type EditableShop } from "@/lib/dashboard/queries";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { ImageUploader } from "./ImageUploader";

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
    if (!window.confirm(t(locale, "img.removeConfirm"))) return;
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
            field === "logoUrl" ? "h-24 w-24 rounded-2xl" : "aspect-[3/1] w-full rounded-xl"
          }`}
        >
          {url ? (
            // Images are served from our own bucket (see backend/internal/storage).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={t(locale, alt, { name: shop.name })} className="h-full w-full object-cover" />
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
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove(field)}
              className="rounded-full px-3 py-2 text-sm text-muted hover:text-danger disabled:opacity-40"
            >
              {t(locale, "img.remove")}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="space-y-6 rounded-2xl bg-white p-6 ring-1 ring-line">
      <h2 className="text-lg font-bold text-ink">{t(locale, "img.shopTitle")}</h2>
      <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
        {slot("logoUrl", "SHOP_LOGO", "img.logo", "img.logoAlt")}
        {slot("bannerUrl", "SHOP_BANNER", "img.banner", "img.bannerAlt")}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {t(locale, error)}
        </p>
      )}
    </section>
  );
}
