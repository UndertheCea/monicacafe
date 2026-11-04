import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format whole New Taiwan Dollars, e.g. 1200 → "1,200". No decimals. */
export function formatTWD(amount: number): string {
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(amount);
}

/** Format an ISO timestamp as a Taipei-local date, e.g. "2026/11/04". */
export function formatTaipeiDate(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
