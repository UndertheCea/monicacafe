"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { roundCoord, type Coords } from "@/lib/dashboard/validate";
import type { MapControlLabels } from "@/lib/mapControls";

const TAIWAN_CENTER: [number, number] = [23.7, 120.96];

/**
 * Click-to-place map pin for a shop's location (Leaflet + OSM, client only).
 * The marker is draggable; every change is reported through `onPick`. When
 * `value` changes from outside (typed lat/lng), the marker follows.
 */
export function LocationPicker({
  value,
  onPick,
  ariaLabel,
  pinLabel,
  loadingLabel,
  failedLabel,
  controlLabels: { zoomIn, zoomOut },
}: {
  value: Coords | null;
  onPick: (c: Coords) => void;
  ariaLabel: string;
  /** The draggable pin's accessible name and tooltip. */
  pinLabel: string;
  loadingLabel: string;
  failedLabel: string;
  /** Leaflet's zoom buttons, translated (#363). */
  controlLabels: MapControlLabels;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").Marker | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);
  const initial = useRef(value);
  // The map is built once; the locale doesn't change while it's on screen.
  const zoomTitles = useRef({ zoomInTitle: zoomIn, zoomOutTitle: zoomOut });
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const L = (await import("leaflet")).default;
        if (cancelled || !el.current) return;
        LRef.current = L;
        const start = initial.current;
        const map = L.map(el.current, { zoomControl: false, scrollWheelZoom: false }).setView(
          start ? [start.lat, start.lng] : TAIWAN_CENTER,
          start ? 15 : 7,
        );
        L.control.zoom(zoomTitles.current).addTo(map);
        // The default prefix carries a blue/yellow flag; keep it plain (static text, not seller-supplied).
        map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
        mapRef.current = map;
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);
        map.on("click", (e) => onPickRef.current({ lat: roundCoord(e.latlng.lat), lng: roundCoord(e.latlng.lng) }));
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("failed");
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Keep the marker in sync with `value`.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || status !== "ready") return;
    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      const icon = L.divIcon({
        className: "",
        html: '<span class="grid h-8 w-8 place-items-center"><span class="block h-4 w-4 rounded-full bg-ink ring-2 ring-white"></span></span>',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      markerRef.current = L.marker([value.lat, value.lng], { icon, draggable: true, keyboard: true, title: pinLabel, alt: pinLabel }).addTo(map);
      markerRef.current.on("dragend", () => {
        const p = markerRef.current!.getLatLng();
        onPickRef.current({ lat: roundCoord(p.lat), lng: roundCoord(p.lng) });
      });
    } else {
      markerRef.current.setLatLng([value.lat, value.lng]);
    }
    // Typed coordinates can land off-screen; bring the pin into view.
    if (!map.getBounds().contains([value.lat, value.lng])) map.panTo([value.lat, value.lng]);
  }, [value, status, pinLabel]);

  return (
    <div className="relative overflow-hidden rounded-box ring-1 ring-line">
      <div ref={el} role="region" aria-label={ariaLabel} className="z-0 h-72 w-full cursor-crosshair bg-paper" />
      {status !== "ready" && (
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
