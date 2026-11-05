"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { LocatedShopPin } from "@/lib/api";

// Centre of Taiwan's main island; used when there are no pins.
const TAIWAN_CENTER: [number, number] = [23.7, 120.96];
const TAIWAN_ZOOM = 7;

/**
 * Leaflet map of shop pins over OpenStreetMap tiles. Leaflet touches
 * `window` at import time, so it is loaded inside the effect (client only).
 * Pins are circle markers, which avoids Leaflet's bundler-unfriendly default
 * marker images.
 */
export function ShopMap({
  pins,
  loadingLabel,
  attribution,
  viewShopLabel,
}: {
  pins: LocatedShopPin[];
  loadingLabel: string;
  attribution: string;
  viewShopLabel: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | undefined;

    import("leaflet").then((L) => {
      if (cancelled || !el.current) return;
      map = L.map(el.current, { scrollWheelZoom: false }).setView(TAIWAN_CENTER, TAIWAN_ZOOM);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: `<a href="https://www.openstreetmap.org/copyright">${attribution}</a>`,
      }).addTo(map);

      const bounds: [number, number][] = [];
      for (const p of pins) {
        // Build the popup with DOM APIs so seller-supplied names are never
        // interpreted as HTML.
        const popup = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = p.name;
        popup.append(name);
        if (p.city) {
          const city = document.createElement("div");
          city.textContent = p.city;
          popup.append(city);
        }
        const link = document.createElement("a");
        link.href = `/shops/${encodeURIComponent(p.slug)}`;
        link.textContent = `${viewShopLabel} →`;
        popup.append(link);

        L.circleMarker([p.lat, p.lng], {
          radius: 9,
          color: "#78350f",
          weight: 2,
          fillColor: "#f59e0b",
          fillOpacity: 0.9,
        })
          .bindTooltip(p.name)
          .bindPopup(popup)
          .addTo(map);
        bounds.push([p.lat, p.lng]);
      }
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
      else if (bounds.length === 1) map.setView(bounds[0], 13);
      setReady(true);
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [pins, attribution, viewShopLabel]);

  return (
    <div className="relative h-[60vh] min-h-80 overflow-hidden rounded-2xl ring-1 ring-stone-200">
      <div ref={el} className="h-full w-full" />
      {!ready && (
        <p className="absolute inset-0 grid place-items-center bg-stone-100 text-sm text-stone-500">{loadingLabel}</p>
      )}
    </div>
  );
}
