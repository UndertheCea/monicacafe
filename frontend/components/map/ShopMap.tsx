"use client";

import "leaflet/dist/leaflet.css";
import type { CircleMarker, Map as LeafletMap } from "leaflet";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PlacedShopPin } from "@/lib/mapPins";
import { t, type Locale } from "@/lib/i18n/dict";

// Roughly the centre of Taiwan's main island; used when there are no pins.
const TAIWAN_CENTER: [number, number] = [23.7, 120.96];
const TAIWAN_ZOOM = 7;
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

type Status = "loading" | "ready" | "failed";

/**
 * Interactive Leaflet map of shop pins (OpenStreetMap tiles). Leaflet touches
 * `window`, so it is imported lazily inside an effect and never runs on the server.
 * The accompanying list doubles as the accessible / no-JS fallback.
 */
export function ShopMap({ pins, locale }: { pins: PlacedShopPin[]; locale: Locale }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef(new Map<string, CircleMarker>());
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;
    const markers = markersRef.current;

    import("leaflet")
      .then(({ default: L }) => {
        if (cancelled || !containerRef.current) return;
        const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView(TAIWAN_CENTER, TAIWAN_ZOOM);
        mapRef.current = map;
        L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);

        for (const pin of pins) {
          const marker = L.circleMarker([pin.lat, pin.lng], {
            radius: 9,
            color: "#78350f", // amber-900
            weight: 2,
            fillColor: "#f59e0b", // amber-500
            fillOpacity: 0.9,
          })
            .bindPopup(popupContent(pin, locale))
            .bindTooltip(pin.name)
            .addTo(map);
          markers.set(pin.id, marker);
        }

        if (pins.length > 1) {
          map.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number])), { padding: [40, 40] });
        } else if (pins.length === 1) {
          map.setView([pins[0].lat, pins[0].lng], 13);
        }
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });

    return () => {
      cancelled = true;
      markers.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [pins, locale]);

  function focus(id: string) {
    const marker = markersRef.current.get(id);
    const map = mapRef.current;
    if (!marker || !map) return;
    map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 13));
    marker.openPopup();
    containerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="relative">
        <div
          ref={containerRef}
          role="region"
          aria-label={t(locale, "map.ariaLabel")}
          className="z-0 h-[60vh] min-h-80 w-full overflow-hidden rounded-2xl bg-stone-100 ring-1 ring-stone-200"
        />
        {status !== "ready" && (
          <p
            role={status === "failed" ? "alert" : "status"}
            className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center text-sm text-stone-500"
          >
            {t(locale, status === "failed" ? "map.loadFailed" : "map.loading")}
          </p>
        )}
      </div>

      <aside>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">{t(locale, "map.list")}</h2>
        <ul className="space-y-2">
          {pins.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl bg-white p-3 ring-1 ring-stone-200">
              <button
                type="button"
                onClick={() => focus(p.id)}
                disabled={status !== "ready"}
                aria-label={t(locale, "map.focus", { name: p.name })}
                className="min-w-0 flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:cursor-default"
              >
                <span className="block truncate font-medium text-stone-900">{p.name}</span>
                <span className="block text-xs text-stone-500">{p.city}</span>
              </button>
              <Link href={`/shops/${encodeURIComponent(p.slug)}`} className="shrink-0 text-sm font-medium text-amber-700 hover:underline">
                {t(locale, "shops.view")}
              </Link>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

/** Popup body built with DOM APIs so seller-supplied names are never parsed as HTML. */
function popupContent(pin: PlacedShopPin, locale: Locale): HTMLElement {
  const root = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = pin.name;
  root.appendChild(name);
  if (pin.city) {
    const city = document.createElement("div");
    city.textContent = pin.city;
    city.style.color = "#78716c"; // stone-500
    root.appendChild(city);
  }
  const link = document.createElement("a");
  link.href = `/shops/${encodeURIComponent(pin.slug)}`;
  link.textContent = t(locale, "map.viewShop");
  link.style.display = "inline-block";
  link.style.marginTop = "4px";
  root.appendChild(link);
  return root;
}
