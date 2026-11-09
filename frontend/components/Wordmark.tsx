import Link from "next/link";
import { WORDMARK } from "@/lib/brand";

/**
 * The "moni cafe" wordmark (#110, #164): a heavy, italic, lowercase grotesque in the spirit of a painted
 * café sign, with "moni" and "cafe" on one line at the same size, so the header stays one row tall on
 * phones. No tagline (owner, #159): the tagline lives in the home page title and description only.
 * Live text (not an image) so it stays crisp; the link's accessible name is "Moni Cafe" and the
 * letters themselves are hidden from screen readers so the name isn't read twice.
 */
export function Wordmark({ size = "md" }: { size?: "md" | "sm" }) {
  const text = size === "md" ? "text-[1.625rem] sm:text-[2rem]" : "text-2xl";
  return (
    <Link
      href="/"
      aria-label={WORDMARK.label}
      className="inline-flex shrink-0 items-baseline whitespace-nowrap leading-none text-ink hover:no-underline"
    >
      <span
        aria-hidden
        className={`flex items-baseline gap-[0.2em] font-wordmark font-extrabold italic lowercase tracking-[-0.06em] ${text}`}
      >
        <span>{WORDMARK.main}</span>
        <span>{WORDMARK.sub}</span>
      </span>
    </Link>
  );
}
