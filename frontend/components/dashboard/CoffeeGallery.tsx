"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { UPDATE_COFFEE, type EditableCoffee } from "@/lib/dashboard/queries";
import { MAX_COFFEE_IMAGES, moveItem, removeAt } from "@/lib/dashboard/upload";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { ImageUploader } from "./ImageUploader";

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

  const btn =
    "rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold text-stone-700 shadow ring-1 ring-stone-200 hover:bg-white disabled:opacity-40";

  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200 sm:p-6">
      <h3 className="font-bold text-stone-900">{t(locale, "img.galleryTitle")}</h3>
      <p className="mt-1 text-sm text-stone-500">{t(locale, "img.galleryHint", { max: MAX_COFFEE_IMAGES })}</p>
      {urls.length > 0 && (
        <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {urls.map((src, i) => (
            <li key={src} className="relative aspect-square overflow-hidden rounded-xl bg-stone-100 ring-1 ring-stone-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={t(locale, "img.photoAlt", { name: coffee.name, n: i + 1 })}
                className="h-full w-full object-cover"
              />
              {i === 0 && (
                <span className="absolute left-2 top-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-stone-900">
                  {t(locale, "img.cover")}
                </span>
              )}
              <div className="absolute inset-x-2 bottom-2 flex justify-between gap-1">
                <button
                  type="button"
                  disabled={busy || i === 0}
                  onClick={() => void change(moveItem(urls, i, i - 1))}
                  aria-label={t(locale, "img.moveEarlier", { n: i + 1 })}
                  className={btn}
                >
                  ←
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => window.confirm(t(locale, "img.removeConfirm")) && void change(removeAt(urls, i))}
                  aria-label={t(locale, "img.removeN", { n: i + 1 })}
                  className={btn}
                >
                  {t(locale, "img.remove")}
                </button>
                <button
                  type="button"
                  disabled={busy || i === urls.length - 1}
                  onClick={() => void change(moveItem(urls, i, i + 1))}
                  aria-label={t(locale, "img.moveLater", { n: i + 1 })}
                  className={btn}
                >
                  →
                </button>
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
          <p className="text-sm text-stone-500">{t(locale, "img.galleryFull", { max: MAX_COFFEE_IMAGES })}</p>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {t(locale, error)}
        </p>
      )}
    </section>
  );
}
