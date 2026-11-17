// Labels for Leaflet's built-in controls (#363), which are English-only by default.
import { t, type Locale, type MessageKey } from "./i18n/dict.ts";

export interface MapControlLabels {
  zoomIn: string;
  zoomOut: string;
  closePopup: string;
}

export const MAP_CONTROL_KEYS = {
  zoomIn: "map.zoomIn",
  zoomOut: "map.zoomOut",
  closePopup: "map.closePopup",
} as const satisfies Record<keyof MapControlLabels, MessageKey>;

export function mapControlLabels(locale: Locale): MapControlLabels {
  return {
    zoomIn: t(locale, MAP_CONTROL_KEYS.zoomIn),
    zoomOut: t(locale, MAP_CONTROL_KEYS.zoomOut),
    closePopup: t(locale, MAP_CONTROL_KEYS.closePopup),
  };
}
