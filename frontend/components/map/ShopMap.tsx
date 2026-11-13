"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { hasCoords, type ShopPin } from "@/lib/api";

// Taiwan main island, used when there are no pins to fit.
const TAIWAN_CENTER: [number, number] = [23.7, 120.96];
const TAIWAN_ZOOM = 7;

// The overlay renders only after hydration: without JavaScript nothing covers the text list.
type Status = "loading" | "ready" | "failed";

/**
 * Leaflet + OpenStreetMap map of shop pins. Leaflet touches `window`, so it is
 * imported inside the effect (client only). Shop names are seller-supplied, so
 * popups are built with DOM nodes + textContent — never HTML strings.
 */
export function ShopMap({
  pins,
  ariaLabel,
  loadingLabel,
  failedLabel,
  twoFingersLabel,
}: {
  pins: ShopPin[];
  ariaLabel: string;
  loadingLabel: string;
  failedLabel: string;
  /** Hint shown on touch screens, where one finger scrolls the page and two move the map. */
  twoFingersLabel: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [touch, setTouch] = useState(false);
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | undefined;

    (async () => {
      try {
        const L = (await import("leaflet")).default;
        if (cancelled || !el.current) return;

        // On touch screens one finger must scroll the page (a 60vh map would trap it): dragging is off and
        // pinch-zoom (two fingers) also pans.
        map = L.map(el.current, { scrollWheelZoom: false, dragging: !L.Browser.mobile }).setView(TAIWAN_CENTER, TAIWAN_ZOOM);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);

        const icon = L.divIcon({
          className: "",
          html: '<span class="grid h-8 w-8 place-items-center"><span class="block h-4 w-4 rounded-full bg-ink ring-2 ring-white"></span></span>',
          iconSize: [32, 32],
          iconAnchor: [16, 16],
          popupAnchor: [0, -16],
        });

        const located = pins.filter(hasCoords);
        for (const p of located) {
          const popup = document.createElement("div");
          const link = document.createElement("a");
          link.href = `/shops/${encodeURIComponent(p.slug)}`;
          link.textContent = p.name;
          link.className = "font-semibold text-ink hover:underline";
          const city = document.createElement("div");
          city.textContent = p.city;
          city.className = "text-xs text-muted";
          popup.append(link, city);

          L.marker([p.lat, p.lng], { icon, title: p.name, alt: p.name, keyboard: true })
            .bindPopup(popup)
            .addTo(map);
        }

        if (located.length === 1) {
          map.setView([located[0].lat, located[0].lng], 13);
        } else if (located.length > 1) {
          map.fitBounds(
            L.latLngBounds(located.map((p) => [p.lat, p.lng] as [number, number])),
            { padding: [40, 40], maxZoom: 13 },
          );
        }
        setTouch(L.Browser.mobile);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("failed");
      }
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [pins]);

  return (
    <div className="relative overflow-hidden rounded-box ring-1 ring-line">
      <div ref={el} role="region" aria-label={ariaLabel} className="z-0 h-[50vh] min-h-[320px] sm:h-[60vh] w-full bg-paper" />
      {touch && status === "ready" && (
        <p className="pointer-events-none absolute inset-x-0 top-0 z-[500] bg-white/90 px-3 py-1 text-center text-xs text-muted">
          {twoFingersLabel}
        </p>
      )}
      {hydrated && status !== "ready" && (
        <div
          role={status === "failed" ? "alert" : "status"}
          className="absolute inset-0 grid place-items-center bg-paper/90 p-4 text-center text-sm text-muted"
        >
          {status === "failed" ? failedLabel : loadingLabel}
        </div>
      )}
    </div>
  );
}
