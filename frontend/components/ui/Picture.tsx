"use client";

import { useEffect, useRef, useState } from "react";
import { thumbUrl } from "@/lib/thumb";

/**
 * The one image component (#235). Always `decoding="async"` with explicit
 * width/height (so the page doesn't jump), lazy unless `priority` (the first
 * image on a page: eager, high fetch priority).
 *
 * `thumb` shows the 640 px thumbnail stored next to an uploaded original, and
 * falls back to the original when there is none (photos uploaded before #235):
 * a <picture> can't fall back on a 404, so this swaps the src on error. The
 * server-rendered image may fail before React attaches onError, hence the
 * check after mount.
 */
export function Picture({
  src,
  alt,
  width,
  height,
  thumb = false,
  priority = false,
  className = "h-full w-full object-cover",
}: {
  src: string;
  /** "" for a decorative image whose meaning is written next to it. */
  alt: string;
  width: number;
  height: number;
  thumb?: boolean;
  priority?: boolean;
  className?: string;
}) {
  const wanted = (thumb && thumbUrl(src)) || src;
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const shown = failedFor === wanted ? src : wanted;
  const img = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0 && wanted !== src) setFailedFor(wanted);
  }, [wanted, src]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={img}
      src={shown}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      onError={() => {
        if (wanted !== src) setFailedFor(wanted);
      }}
      className={className}
    />
  );
}
