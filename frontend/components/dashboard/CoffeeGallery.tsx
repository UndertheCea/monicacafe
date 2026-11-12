"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { UPDATE_COFFEE, type EditableCoffee } from "@/lib/dashboard/queries";
import { MAX_COFFEE_IMAGES, moveItem, removeAt } from "@/lib/dashboard/upload";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { ImageUploader } from "./ImageUploader";
import { Badge, Button, Card, ConfirmButton } from "@/components/ui";

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
  const [error, setError] = useState<MessageKey | null>(null);
  const urls = coffee.imageUrls;

  async function save(next: string[]) {
    const r = await request(UPDATE_COFFEE, { id: coffee.id, input: { imageUrls: next } });
    onSaved(r.updateCoffee);
  }

  async function change(next: string[]) {
    setBusy(true);
    setError(null);
    try {
      await save(next);
    } catch {
      setError("img.error.save");
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={t(locale, "img.photoAlt", { name: coffee.name, n: i + 1 })}
                  className="h-full w-full object-cover"
                />
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
                  disabled={busy || i === 0}
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
                  busy={busy}
                  onConfirm={() => void change(removeAt(urls, i))}
                >
                  <span aria-hidden="true">{t(locale, "img.remove")}</span>
                  <span className="sr-only">{t(locale, "img.removeN", { n: i + 1 })}</span>
                </ConfirmButton>
                <Button
                  type="button"
                  disabled={busy || i === urls.length - 1}
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
            label={t(locale, "img.addPhoto")}
            onUploaded={(u) => save([...urls, u])}
          />
        ) : (
          <p className="text-sm text-muted">{t(locale, "img.galleryFull", { max: MAX_COFFEE_IMAGES })}</p>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {t(locale, error)}
        </p>
      )}
    </Card>
  );
}
