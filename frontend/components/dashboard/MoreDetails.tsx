"use client";

import { t, type Locale } from "@/lib/i18n/dict";
import { CARD } from "@/lib/ui";

/**
 * The "More details (optional)" fold on the coffee forms (#182): a native
 * <details>, so it opens and closes without JavaScript. The summary counts the
 * optional fields already filled. `open` is kept in sync with the user's own
 * toggling, and the form sets it to show a problem inside the fold.
 */
export function MoreDetails({
  locale,
  filled,
  open,
  onOpenChange,
  className = "",
  children,
}: {
  locale: Locale;
  filled: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <details
      open={open}
      onToggle={(e) => onOpenChange(e.currentTarget.open)}
      className={`${CARD} group ${className}`}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-box px-4 py-4 font-bold text-ink sm:px-6 [&::-webkit-details-marker]:hidden">
        <span>{filled > 0 ? t(locale, "cf.moreDetailsFilled", { n: filled }) : t(locale, "cf.moreDetails")}</span>
        <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="grid gap-4 px-4 pb-6 sm:grid-cols-2 sm:px-6">{children}</div>
    </details>
  );
}
