// Taiwan-time helpers. Containers run in UTC, so never use getFullYear() for what a visitor in Taipei sees.

/** The calendar year in Taiwan (UTC+8, no DST): what the API compares crop years with. */
export function taipeiYear(now: Date = new Date()): number {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).getUTCFullYear();
}
