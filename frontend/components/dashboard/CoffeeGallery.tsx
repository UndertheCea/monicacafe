"use client";

import { useEffect, useRef, useState } from "react";
import { dashWriteError, type DashWriteError } from "@/lib/dashboard/writeError";
import { toApiError } from "@/lib/graphql";
import { useAuth } from "@/components/auth/AuthProvider";
import { UPDATE_COFFEE, type EditableCoffee } from "@/lib/dashboard/queries";
import { MAX_COFFEE_IMAGES, appendImage, moveItem, removeAt } from "@/lib/dashboard/upload";
import { t, type Locale } from "@/lib/i18n/dict";
import { ImageUploader } from "./ImageUploader";
import { Badge, Button, Card, ConfirmButton, Picture } from "@/components/ui";

/** Coffee photo gallery: add, remove and reorder (first = cover). Saved on every change. */
export function CoffeeGallery({
  coffee,
  locale,
  onSaved,
}: {
  coffee: EditableCoffee;
  locale: Locale;
  onSaved: (c: Omit<EditableCoffee, "variants">) => void;
}) {
  const { request } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DashWriteError | null>(null);
  const [uploading, setUploading] = useState(false);
  const urls = coffee.imageUrls;
  // The uploader's callback outlives the render that created it: read the newest list from here (#388).
  const latest = useRef(urls);
  useEffect(() => {
    latest.current = urls;
  }, [urls]);
  const locked = busy || uploading;

  async function save(next: string[]) {
    const r = await request(UPDATE_COFFEE, { id: coffee.id, input: { imageUrls: next } });
    latest.current = r.updateCoffee.imageUrls;
    onSaved(r.updateCoffee);
  }

  async function change(next: string[]) {
    setBusy(true);
    setError(null);
    try {
      await save(next);
    } catch (err) {
      const e = toApiError(err);
      setError(dashWriteError(e.code, e.retryAfter) ?? { key: "img.error.save" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card as="section" className="p-4 sm:p-6">
      <h3 className="font-bold text-ink">{t(locale, "img.galleryTitle")}</h3>
      <p className="mt-1 text-sm text-muted">{t(locale, "img.galleryHint", { max: MAX_COFFEE_IMAGES })}</p>
      {urls.length > 0 && (
        <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {urls.map((src, i) => (
            <li key={src}>
              <div className="relative aspect-square overflow-hidden rounded-box bg-paper ring-1 ring-line">
                <Picture src={src} thumb width={320} height={320} alt={t(locale, "img.photoAlt", { name: coffee.name, n: i + 1 })} />
                {i === 0 && (
                  <Badge tone="solid" className="absolute left-2 top-2">
                    {t(locale, "img.cover")}
                  </Badge>
                )}
              </div>
              {/* Below the photo, not over it: the inline "remove this?" question needs the room. */}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-1">
                <Button
                  type="button"
                  disabled={locked || i === 0}
                  onClick={() => void change(moveItem(urls, i, i - 1))}
                  aria-label={t(locale, "img.moveEarlier", { n: i + 1 })}
                  variant="secondary"
                  size="sm"
                >
                  ←
                </Button>
                <ConfirmButton
                  question={t(locale, "img.removeConfirm")}
                  confirmLabel={t(locale, "img.remove")}
                  cancelLabel={t(locale, "confirm.cancel")}
                  variant="secondary"
                  busy={locked}
                  onConfirm={() => void change(removeAt(urls, i))}
                >
                  <span aria-hidden="true">{t(locale, "img.remove")}</span>
                  <span className="sr-only">{t(locale, "img.removeN", { n: i + 1 })}</span>
                </ConfirmButton>
                <Button
                  type="button"
                  disabled={locked || i === urls.length - 1}
                  onClick={() => void change(moveItem(urls, i, i + 1))}
                  aria-label={t(locale, "img.moveLater", { n: i + 1 })}
                  variant="secondary"
                  size="sm"
                >
                  →
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-4">
        {urls.length < MAX_COFFEE_IMAGES ? (
          <ImageUploader
            kind="COFFEE_PHOTO"
            targetId={coffee.id}
            locale={locale}
            disabled={busy}
            onBusyChange={setUploading}
            label={t(locale, "img.addPhoto")}
            onUploaded={(u) => save(appendImage(latest.current, u))}
          />
        ) : (
          <p className="text-sm text-muted">{t(locale, "img.galleryFull", { max: MAX_COFFEE_IMAGES })}</p>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {t(locale, error.key, error.vars)}
        </p>
      )}
    </Card>
  );
}
