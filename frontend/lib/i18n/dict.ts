// Stage 1 bilingual dictionary: zh-TW is primary, English secondary.
// Add keys to both locales; TypeScript enforces parity via `Messages`.

export const LOCALES = ["zh-TW", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "zh-TW";
export const LOCALE_COOKIE = "locale";

const zhTW = {
  "brand.tagline": "台灣精品咖啡市集",
  "nav.coffees": "咖啡豆",
  "nav.shops": "店家",
  "nav.map": "地圖",
  "lang.toggle": "English",
  "lang.toggleAria": "切換為英文",
  "coffees.title": "探索咖啡豆",
  "coffees.subtitle": "來自台灣各地烘豆師的精品咖啡",
  "coffees.count": "共 {n} 款咖啡",
  "coffees.empty": "沒有符合條件的咖啡，試試調整篩選條件。",
  "coffees.from": "NT${price} 起",
  "coffees.soldOut": "暫無庫存",
  "coffees.comments": "{n} 則留言",
  "filter.title": "篩選",
  "filter.origin": "產地",
  "filter.variety": "品種",
  "filter.process": "處理法",
  "filter.roast": "烘焙度",
  "filter.flavor": "風味",
  "filter.flavorPlaceholder": "例如：茉莉花、柑橘",
  "filter.price": "價格 (NT$)",
  "filter.min": "最低",
  "filter.max": "最高",
  "filter.any": "全部",
  "filter.apply": "套用篩選",
  "filter.reset": "清除",
  "roast.LIGHT": "淺焙",
  "roast.MEDIUM": "中焙",
  "roast.MEDIUM_DARK": "中深焙",
  "roast.DARK": "深焙",
  "page.prev": "上一頁",
  "page.next": "下一頁",
  "page.of": "第 {page} / {pages} 頁",
  "error.title": "無法載入資料",
  "error.retry": "請稍後再試。",
  "footer.copy": "© {year} MONI CAFE · 僅配送台灣本島及離島",
} as const;

export type MessageKey = keyof typeof zhTW;
type Messages = Record<MessageKey, string>;

const en: Messages = {
  "brand.tagline": "Taiwan specialty coffee marketplace",
  "nav.coffees": "Coffees",
  "nav.shops": "Shops",
  "nav.map": "Map",
  "lang.toggle": "中文",
  "lang.toggleAria": "Switch to Traditional Chinese",
  "coffees.title": "Explore coffees",
  "coffees.subtitle": "Specialty coffee from roasters across Taiwan",
  "coffees.count": "{n} coffees",
  "coffees.empty": "No coffees match these filters. Try widening your search.",
  "coffees.from": "From NT${price}",
  "coffees.soldOut": "Out of stock",
  "coffees.comments": "{n} comments",
  "filter.title": "Filters",
  "filter.origin": "Origin",
  "filter.variety": "Variety",
  "filter.process": "Process",
  "filter.roast": "Roast",
  "filter.flavor": "Flavor",
  "filter.flavorPlaceholder": "e.g. jasmine, citrus",
  "filter.price": "Price (NT$)",
  "filter.min": "Min",
  "filter.max": "Max",
  "filter.any": "Any",
  "filter.apply": "Apply filters",
  "filter.reset": "Clear",
  "roast.LIGHT": "Light",
  "roast.MEDIUM": "Medium",
  "roast.MEDIUM_DARK": "Medium-dark",
  "roast.DARK": "Dark",
  "page.prev": "Previous",
  "page.next": "Next",
  "page.of": "Page {page} of {pages}",
  "error.title": "Couldn't load data",
  "error.retry": "Please try again later.",
  "footer.copy": "© {year} MONI CAFE · Ships within Taiwan only",
};

const DICTS: Record<Locale, Messages> = { "zh-TW": zhTW, en };

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

/** Translate `key` for `locale`, interpolating `{name}` placeholders. */
export function t(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const msg = DICTS[locale][key] ?? DICTS[DEFAULT_LOCALE][key];
  if (!vars) return msg;
  return msg.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in vars ? String(vars[name]) : m,
  );
}

/** Pick the zh or en variant of a bilingual DB field. */
export function pick(locale: Locale, zh: string, en: string): string {
  return locale === "en" ? en : zh;
}
