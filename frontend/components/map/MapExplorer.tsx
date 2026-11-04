"use client";

import Link from "next/link";
import { useState } from "react";
import { ShopMap, type MapPin } from "./ShopMap";

/** Map plus a clickable shop list; selecting a shop pans the map to it. */
export function MapExplorer({
  pins,
  labels,
}: {
  pins: MapPin[];
  labels: { list: string; view: string; aria: string; loading: string };
}) {
  const [focus, setFocus] = useState<string | null>(null);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <ShopMap
        pins={pins}
        focusSlug={focus}
        viewLabel={labels.view}
        ariaLabel={labels.aria}
        loadingLabel={labels.loading}
      />
      <section aria-labelledby="map-list-title">
        <h2 id="map-list-title" className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
          {labels.list}
        </h2>
        <ul className="divide-y divide-stone-200 rounded-2xl bg-white ring-1 ring-stone-200 lg:max-h-[60vh] lg:overflow-y-auto">
          {pins.map((p) => (
            <li key={p.slug} className="flex items-center justify-between gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => setFocus(p.slug)}
                aria-pressed={focus === p.slug}
                className="min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                <span className="block truncate font-medium text-stone-900">{p.name}</span>
                <span className="block text-xs text-stone-500">{p.city}</span>
              </button>
              <Link
                href={`/shops/${p.slug}`}
                className="shrink-0 text-xs font-medium text-amber-700 hover:underline"
              >
                {labels.view}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
