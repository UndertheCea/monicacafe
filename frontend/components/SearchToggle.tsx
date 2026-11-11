"use client";

import { usePathname } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { t, type Locale } from "@/lib/i18n/dict";
import { HeaderSearch, HeaderSearchForm } from "./HeaderSearch";

/**
 * The header's search icon (#175; every width since #185): it unfolds the
 * search field in a panel under the header. A native <details>, so it opens without
 * JavaScript too; with it, the field is focused on open and the panel closes
 * after a search or a navigation.
 */
export function SearchToggle({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(false);
  }

  return (
    <details
      ref={ref}
      open={open}
      onToggle={(e) => {
        const isOpen = e.currentTarget.open;
        setOpen(isOpen);
        if (isOpen) e.currentTarget.querySelector("input")?.focus();
      }}
    >
      <summary
        aria-label={t(locale, "nav.searchOpen")}
        className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-line text-ink hover:border-ink [&::-webkit-details-marker]:hidden"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75">
          <circle cx="8.5" cy="8.5" r="5.25" />
          <path d="M12.5 12.5 17 17" strokeLinecap="round" />
        </svg>
      </summary>
      <div className="absolute inset-x-0 top-full border-b border-line bg-white px-4 py-3">
        <div className="mx-auto max-w-xl">
        <Suspense fallback={<HeaderSearchForm locale={locale} />}>
          <HeaderSearch locale={locale} onDone={() => setOpen(false)} />
        </Suspense>
        </div>
      </div>
    </details>
  );
}
