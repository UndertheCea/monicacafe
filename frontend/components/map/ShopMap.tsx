"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, CircleMarker } from "leaflet";

export interface MapPin {
  slug: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
}

// Centre of Taiwan; used when there are no pins to fit.
const TAIWAN_CENTER: [number, number] = [23.7, 120.95];
const TAIWAN_ZOOM = 7;

/**
 * Leaflet map with one amber pin per shop. Leaflet touches `window`, so it is
 * imported lazily inside an effect and never runs during SSR.
 *
 * Popups are built with DOM APIs (textContent), never HTML strings, so shop
 * names from sellers cannot inject markup.
 */
export function ShopMap({
  pins,
  focusSlug,
  viewLabel,
  ariaLabel,
  loadingLabel,
}: {
  pins: MapPin[];
  focusSlug: string | null;
  viewLabel: string;
  ariaLabel: string;
  loadingLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Map<string, CircleMarker>>(new Map());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const markers = markersRef.current;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, { scrollWheelZoom: false });
      mapRef.current = map;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      for (const p of pins) {
        const popup = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = p.name;
        const city = document.createElement("div");
        city.textContent = p.city;
        city.style.color = "#78716c";
        const link = document.createElement("a");
        link.href = `/shops/${encodeURIComponent(p.slug)}`;
        link.textContent = viewLabel;
        link.style.color = "#b45309";
        popup.append(name, city, link);

        const marker = L.circleMarker([p.lat, p.lng], {
          radius: 9,
          color: "#78350f",
          weight: 2,
          fillColor: "#f59e0b",
          fillOpacity: 0.9,
        })
          .bindPopup(popup)
          .bindTooltip(p.name)
          .addTo(map);
        markers.set(p.slug, marker);
      }

      if (pins.length > 0) {
        map.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number])), {
          padding: [40, 40],
          maxZoom: 13,
        });
      } else {
        map.setView(TAIWAN_CENTER, TAIWAN_ZOOM);
      }
      setReady(true);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markers.clear();
    };
  }, [pins, viewLabel]);

  // Pan to and open the popup of the shop selected in the list.
  useEffect(() => {
    if (!focusSlug) return;
    const marker = markersRef.current.get(focusSlug);
    const map = mapRef.current;
    if (!marker || !map) return;
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 14));
    marker.openPopup();
  }, [focusSlug]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={ariaLabel}
      className="relative z-0 h-[60vh] min-h-80 w-full overflow-hidden rounded-2xl bg-stone-100 ring-1 ring-stone-200"
    >
      {!ready && (
        <p className="absolute inset-0 grid place-items-center text-sm text-stone-500">{loadingLabel}</p>
      )}
    </div>
  );
}
