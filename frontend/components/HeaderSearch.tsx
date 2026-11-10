"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent } from "react";
import { SEARCH_MAX_CHARS, parseSearchParam, searchHref } from "@/lib/coffeeQuery";
import { t, type Locale } from "@/lib/i18n/dict";

const inputCls =
  "w-full rounded-full border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-800 placeholder:text-neutral-400 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink";

/**
 * Header search: a plain GET form to /coffees (works without JavaScript). With
 * JavaScript it navigates client-side and drops a blank `?q=`. Prefilled with
 * the current search on /coffees. Shown in the header's search panel
 * (SearchToggle).
 */
export function HeaderSearch({
  locale,
  onDone,
}: {
  locale: Locale;
  /** Called after a search is submitted (the search panel closes). */
  onDone?: () => void;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const current = pathname === "/coffees" ? (parseSearchParam(params.get("q") ?? undefined) ?? "") : "";

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q");
    router.push(searchHref(typeof q === "string" ? q : undefined));
    onDone?.();
  }

  return (
    <HeaderSearchForm locale={locale} defaultValue={current} onSubmit={submit} key={current} />
  );
}

/** The bare form; also the Suspense fallback while search params are read. */
export function HeaderSearchForm({
  locale,
  defaultValue = "",
  onSubmit,
}: {
  locale: Locale;
  defaultValue?: string;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form role="search" method="get" action="/coffees" onSubmit={onSubmit} className="block w-full">
      <label className="block">
        <span className="sr-only">{t(locale, "nav.search")}</span>
        <input
          type="search"
          name="q"
          defaultValue={defaultValue}
          maxLength={SEARCH_MAX_CHARS}
          placeholder={t(locale, "nav.searchPlaceholder")}
          className={inputCls}
        />
      </label>
    </form>
  );
}
