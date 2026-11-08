import Link from "next/link";
import { WORDMARK } from "@/lib/brand";

/**
 * The "moni cafe" wordmark (#110): a heavy, italic, lowercase grotesque in the spirit of a painted
 * café sign — the big word on top, the small words tucked under its right edge. Live text (not an image)
 * so it stays crisp; the link's accessible name is "Moni Cafe" and the letters themselves are hidden
 * from screen readers so the name isn't read twice.
 */
export function Wordmark({
  size = "md",
  sub,
}: {
  size?: "md" | "sm";
  /** Optional extra line next to "cafe" (e.g. the tagline); hidden on phones. */
  sub?: string;
}) {
  const big = size === "md" ? "text-[2rem] sm:text-[2.25rem]" : "text-2xl";
  return (
    <Link
      href="/"
      aria-label={WORDMARK.label}
      className="inline-flex flex-col items-end leading-none text-ink hover:no-underline"
    >
      <span aria-hidden className={`font-wordmark font-extrabold italic lowercase tracking-[-0.06em] ${big}`}>
        {WORDMARK.main}
      </span>
      <span aria-hidden className="-mt-0.5 flex items-baseline gap-1.5 pr-0.5 font-wordmark text-[0.6875rem] font-extrabold italic lowercase tracking-[-0.02em]">
        {sub && <span className="hidden font-sans font-medium not-italic text-muted sm:inline">{sub} /</span>}
        <span>{WORDMARK.sub}</span>
      </span>
    </Link>
  );
}
