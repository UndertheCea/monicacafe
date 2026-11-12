"use client";

import { useRef, useState } from "react";
import { clampIndex, galleryPhotos, stepIndex } from "@/lib/gallery";
import { t, type Locale } from "@/lib/i18n/dict";
import { Picture } from "@/components/ui";

/**
 * Coffee photos: the selected one large, every photo (cover included) as a
 * thumbnail button underneath. Arrow keys move between thumbnails. The large
 * photo is the first image on the page, so it loads eagerly with high priority.
 */
export function PhotoGallery({
  images,
  name,
  locale,
  placeholder,
}: {
  images: string[];
  name: string;
  locale: Locale;
  /** Shown when the coffee has no photo (the colour tile, #111). */
  placeholder: React.ReactNode;
}) {
  const photos = galleryPhotos(images);
  const [selected, setSelected] = useState(0);
  const thumbs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = clampIndex(selected, photos.length);
  const hero = photos[current];

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = stepIndex(i, photos.length, dir);
    setSelected(next);
    thumbs.current[next]?.focus();
  }

  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-box bg-paper ring-1 ring-line">
        {hero ? (
          <Picture
            src={hero}
            width={1000}
            height={1000}
            priority
            alt={current === 0 ? name : t(locale, "img.photoAlt", { name, n: current + 1 })}
          />
        ) : (
          placeholder
        )}
      </div>
      {photos.length > 1 && (
        <ul className="mt-3 grid grid-cols-4 gap-3" aria-label={t(locale, "img.galleryTitle")}>
          {photos.map((src, i) => (
            <li key={src}>
              <button
                type="button"
                ref={(el) => {
                  thumbs.current[i] = el;
                }}
                onClick={() => setSelected(i)}
                onKeyDown={(e) => onKeyDown(e, i)}
                aria-pressed={i === current}
                aria-label={t(locale, "img.showPhoto", { n: i + 1, total: photos.length })}
                className={`block aspect-square w-full overflow-hidden rounded-box ring-1 ${
                  i === current ? "ring-2 ring-ink" : "ring-line opacity-80 hover:opacity-100"
                }`}
              >
                <Picture src={src} thumb width={160} height={160} alt="" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
