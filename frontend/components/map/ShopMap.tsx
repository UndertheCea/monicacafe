"use client";

import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, Marker } from "leaflet";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ShopPin } from "@/lib/api";

/** A pin the map can plot (the backend nulls invalid coordinates). */
export type PlottablePin = ShopPin & { lat: number; lng: number };

// Roughly the centre of Taiwan; used when there is nothing to fit.
const TAIWAN_CENTER: [number, number] = [23.7, 120.95];
const TAIWAN_ZOOM = 7;

interface Labels {
  ariaLabel: string;
  loading: string;
  attribution: string;
  listTitle: string;
  viewShop: string;
}

/**
 * Leaflet + OpenStreetMap map of shop pins with a clickable side list.
 * Leaflet touches `window`, so it is imported inside the effect and only ever
 * runs in the browser; the list renders on the server too.
 */
export function ShopMap({ pins, labels }: { pins: PlottablePin[]; labels: Labels }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef(new Map<string, Marker>());
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const markers = markersRef.current;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView(TAIWAN_CENTER, TAIWAN_ZOOM);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: `<a href="https://www.openstreetmap.org/copyright">${escapeHTML(labels.attribution)}</a>`,
      }).addTo(map);

      // A CSS-only marker: Leaflet's default PNG icons break under bundlers.
      const icon = L.divIcon({
        className: "",
        html: '<span class="block h-5 w-5 rounded-full border-2 border-white bg-amber-600 shadow-md shadow-stone-900/40"></span>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -12],
      });

      for (const p of pins) {
        const marker = L.marker([p.lat, p.lng], { icon, title: p.name, alt: p.name })
          .addTo(map)
          .bindPopup(() => popupContent(p, labels.viewShop));
        marker.on("popupopen", () => setActive(p.id));
        marker.on("popupclose", () => setActive((cur) => (cur === p.id ? null : cur)));
        markers.set(p.id, marker);
      }

      if (pins.length > 1) {
        map.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number])), {
          padding: [40, 40],
          maxZoom: 12,
        });
      } else if (pins.length === 1) {
        map.setView([pins[0].lat, pins[0].lng], 13);
      }

      mapRef.current = map;
      setReady(true);
    })();

    return () => {
      cancelled = true;
      markers.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [pins, labels.attribution, labels.viewShop]);

  function focusPin(p: PlottablePin) {
    const map = mapRef.current;
    const marker = markersRef.current.get(p.id);
    if (!map || !marker) return;
    map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 13), { duration: 0.6 });
    marker.openPopup();
    containerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="relative isolate overflow-hidden rounded-2xl ring-1 ring-stone-200">
        <div
          ref={containerRef}
          role="region"
          aria-label={labels.ariaLabel}
          className="h-[60vh] min-h-80 w-full bg-stone-100"
        />
        {!ready && (
          <p className="absolute inset-0 grid place-items-center text-sm text-stone-500" aria-live="polite">
            {labels.loading}
          </p>
        )}
      </div>

      <aside>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-500">{labels.listTitle}</h2>
        <ul className="space-y-2">
          {pins.map((p) => (
            <li key={p.id}>
              <div
                className={`flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 ring-1 transition ${
                  active === p.id ? "ring-2 ring-amber-500" : "ring-stone-200"
                }`}
              >
                <button
                  type="button"
                  onClick={() => focusPin(p)}
                  disabled={!ready}
                  className="min-w-0 flex-1 text-left focus:outline-none focus-visible:underline"
                >
                  <span className="block truncate font-semibold text-stone-900">{p.name}</span>
                  {p.city && <span className="block text-xs text-stone-500">{p.city}</span>}
                </button>
                <Link
                  href={`/shops/${p.slug}`}
                  className="shrink-0 text-sm font-medium text-amber-700 hover:underline"
                >
                  {labels.viewShop} →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

/** Popup DOM built with textContent — shop names are seller-supplied. */
function popupContent(p: PlottablePin, viewShop: string): HTMLElement {
  const root = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = p.name;
  root.appendChild(name);
  if (p.city) {
    const city = document.createElement("div");
    city.textContent = p.city;
    city.style.color = "#78716c";
    root.appendChild(city);
  }
  const link = document.createElement("a");
  link.href = `/shops/${encodeURIComponent(p.slug)}`;
  link.textContent = `${viewShop} →`;
  link.style.display = "inline-block";
  link.style.marginTop = "4px";
  root.appendChild(link);
  return root;
}

function escapeHTML(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
