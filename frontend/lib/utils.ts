import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format whole New Taiwan Dollars, e.g. 1200 → "1,200". No decimals. */
export function formatTWD(amount: number): string {
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(amount);
}
