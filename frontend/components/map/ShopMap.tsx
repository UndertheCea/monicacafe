"use client";

import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import { boundsOf, groupByCity, TAIWAN_CENTER, TAIWAN_ZOOM, type LocatedPin } from "@/lib/map";

export interface ShopMapLabels {
  mapAria: string;
  viewShop: string;
  showOnMap: string;
  otherCity: string;
  loading: string;
}

// A CSS-only pin: Leaflet's default marker images don't survive bundling, and
// a divIcon keeps the map free of extra static assets.
const PIN_HTML =
  '<span class="block h-6 w-6 -translate-y-1 rotate-45 rounded-full rounded-br-none bg-amber-600 ring-2 ring-white shadow-md"></span>';

/** Build popup content with DOM APIs (textContent) so shop names are never parsed as HTML. */
function popupContent(pin: LocatedPin, viewShop: string): HTMLElement {
  const root = document.createElement("div");
  root.className = "min-w-36";
  const name = document.createElement("p");
  name.className = "font-bold text-stone-900";
  name.textContent = pin.name;
  const city = document.createElement("p");
  city.className = "text-xs text-stone-500";
  city.textContent = pin.city;
  const link = document.createElement("a");
  link.href = `/shops/${encodeURIComponent(pin.slug)}`;
  link.className = "mt-1 inline-block text-sm font-medium text-amber-700!";
  link.textContent = `${viewShop} →`;
  root.append(name, city, link);
  return root;
}

export function ShopMap({ pins, labels }: { pins: LocatedPin[]; labels: ShopMapLabels }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const markers = markersRef.current;

    // Leaflet touches `window` on import, so load it only in the browser.
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;
      const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView(TAIWAN_CENTER, TAIWAN_ZOOM);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const icon = L.divIcon({ html: PIN_HTML, className: "", iconSize: [24, 24], iconAnchor: [12, 24], popupAnchor: [0, -24] });
      for (const pin of pins) {
        const marker = L.marker([pin.lat, pin.lng], { icon, title: pin.name, alt: pin.name, keyboard: true })
          .bindPopup(() => popupContent(pin, labels.viewShop))
          .addTo(map);
        markers.set(pin.id, marker);
      }

      const bounds = boundsOf(pins);
      if (bounds && pins.length > 1) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
      else if (bounds) map.setView(bounds[0], 13);

      mapRef.current = map;
      setReady(true);
    });

    return () => {
      cancelled = true;
      markers.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [pins, labels.viewShop]);

  function focus(pin: LocatedPin) {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo([pin.lat, pin.lng], Math.max(map.getZoom(), 14));
    markersRef.current.get(pin.id)?.openPopup();
    containerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="relative">
        <div
          ref={containerRef}
          role="region"
          aria-label={labels.mapAria}
          className="z-0 h-[60vh] min-h-80 w-full overflow-hidden rounded-2xl bg-stone-200 ring-1 ring-stone-200"
        />
        {!ready && (
          <p className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-stone-500">
            {labels.loading}
          </p>
        )}
      </div>

      <aside className="space-y-5 lg:max-h-[60vh] lg:overflow-y-auto lg:pr-1">
        {groupByCity(pins).map(([city, cityPins]) => (
          <section key={city || "_"}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
              {city || labels.otherCity}
            </h2>
            <ul className="space-y-2">
              {cityPins.map((pin) => (
                <li key={pin.id} className="rounded-xl bg-white p-3 ring-1 ring-stone-200">
                  <Link href={`/shops/${pin.slug}`} className="font-semibold text-stone-900 hover:text-amber-700">
                    {pin.name}
                  </Link>
                  <button
                    type="button"
                    onClick={() => focus(pin)}
                    disabled={!ready}
                    className="mt-1 block text-sm text-amber-700 hover:underline disabled:opacity-50"
                  >
                    📍 {labels.showOnMap}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </aside>
    </div>
  );
}
